import { createHash, randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { endpoint, catalogue } from "./catalogue.js";
import { Store } from "./storage.js";

const ACCOUNT_READ_INTERVAL_MS = 10050;
const ACCOUNT_RATE_RETRY_MS = 60500;
const ACCOUNT_READ_ATTEMPTS = 3;
const ACCOUNT_QUEUE_TIMEOUT_MS = 900000;

function decodeCredential(value, label, allowBasicPrefix = false) {
  if (typeof value !== "string")
    throw new Error(label + " must resolve to a string");
  const encoded = allowBasicPrefix
    ? value.trim().replace(/^Basic\s+/i, "")
    : value.trim();
  const bytes = Buffer.from(encoded, "base64");
  const canonical = bytes.toString("base64");
  if (
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) ||
    (encoded.includes("=")
      ? canonical !== encoded
      : canonical.replace(/=+$/, "") !== encoded)
  )
    throw new Error(label + " must contain valid Base64");
  const decoded = bytes.toString("utf8");
  if (
    !Buffer.from(decoded, "utf8").equals(bytes) ||
    /[\x00-\x1f\x7f]/.test(decoded)
  )
    throw new Error(label + " must encode UTF-8 credentials without control characters");
  return decoded;
}

export function spendingTotal(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0)
      throw new Error("Invalid account spending value");
    return value;
  }
  if (value === null) return 0;
  if (!value || typeof value !== "object")
    throw new Error("Invalid account spending value");
  if (typeof value.total === "number") return spendingTotal(value.total);
  const keys = Object.keys(value);
  let total = 0;
  for (const key of keys) {
    if (
      key === "value" ||
      (!key.startsWith("total_") && keys.includes("total_" + key))
    )
      continue;
    total += spendingTotal(value[key]);
  }
  return total;
}
export class Client {
  constructor(config = {}, fetcher = fetch, clock = {}) {
    this.config = config;
    this.fetcher = fetcher;
    this.store = new Store(config.dataDirectory);
    this.clock = {
      now: clock.now || Date.now,
      wait: clock.wait || ((ms, signal) => pause(ms, undefined, { signal })),
    };
  }
  credentials() {
    const keys = ["password", "passwordBase64", "authBase64"];
    const present = (value) => value !== undefined && value !== null && value !== "";
    const source = keys.some((key) => present(this.config[key]))
      ? this.config
      : {
          password: process.env.DATAFORSEO_PASSWORD,
          passwordBase64: process.env.DATAFORSEO_PASSWORD_BASE64,
          authBase64: process.env.DATAFORSEO_AUTH_BASE64,
        };
    const modes = keys.filter((key) => present(source[key]));
    if (modes.length > 1)
      throw new Error("Choose only one of password, passwordBase64 or authBase64 (or the corresponding environment variables)");
    let login = this.config.login || process.env.DATAFORSEO_LOGIN;
    let password;
    if (modes[0] === "authBase64") {
      const pair = decodeCredential(source.authBase64, "authBase64", true);
      const separator = pair.indexOf(":");
      if (separator <= 0 || separator === pair.length - 1)
        throw new Error("authBase64 must encode a nonempty login:password pair");
      const decodedLogin = pair.slice(0, separator);
      if (login && login !== decodedLogin)
        throw new Error("Configured login does not match authBase64");
      login = decodedLogin;
      password = pair.slice(separator + 1);
    } else if (modes[0] === "passwordBase64") {
      password = decodeCredential(source.passwordBase64, "passwordBase64");
    } else {
      password = source.password;
    }
    if (
      typeof login !== "string" ||
      typeof password !== "string" ||
      !login ||
      !password
    )
      throw new Error(
        "Configure an API login with password or passwordBase64, or a complete authBase64 credential pair, through environment variables or OpenClaw secret inputs",
      );
    if (login.includes(":") || /[\x00-\x1f\x7f]/.test(login + password))
      throw new Error("API credentials contain an invalid login or control characters");
    return { login, password };
  }
  async transport(item, body, bindings = {}, signal, format = "json") {
    const { login, password } = this.credentials();
    const path = item.path.replace(/\{([^}]+)\}/g, (_, name) => {
      const value = bindings[name];
      if (
        value === undefined ||
        value === null ||
        value === "" ||
        value === "." ||
        value === ".."
      )
        throw new Error("Missing or invalid path parameter: " + name);
      return encodeURIComponent(String(value));
    });
    if (!/^\/v3\/[A-Za-z0-9_/%.-]+$/.test(path))
      throw new Error("Unsafe endpoint path");
    const base = this.config.sandbox
      ? "https://sandbox.dataforseo.com"
      : "https://api.dataforseo.com";
    const execute = async () => {
      const timeout = AbortSignal.timeout(this.config.requestTimeoutMs || 60000);
      const response = await this.fetcher(
        base + path + (format === "ai" ? ".ai" : ""),
        {
          method: item.method,
          redirect: "error",
          headers: {
            Authorization:
              "Basic " + Buffer.from(login + ":" + password).toString("base64"),
            "Content-Type": "application/json",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        },
      );
      const raw = await response.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        data = null;
      }
      const retryAfter = response.headers.get("retry-after");
      const retryAfterMs = retryAfter
        ? /^\d+(?:\.\d+)?$/.test(retryAfter)
          ? Number(retryAfter) * 1000
          : Math.max(0, Date.parse(retryAfter) - this.clock.now())
        : 0;
      return { raw, data, httpStatus: response.status, retryAfterMs };
    };
    if (item.method !== "GET" || item.path !== "/v3/appendix/user_data")
      return execute();
    const accountKey = createHash("sha256")
      .update(login)
      .digest("hex")
      .slice(0, 24);
    const recordId = "account-rate-" + accountKey;
    return this.store.lock(
      "account-read-" + accountKey,
      async () => {
        for (let attempt = 0; attempt < ACCOUNT_READ_ATTEMPTS; attempt++) {
          let previous;
          try {
            previous = await this.store.get(recordId);
          } catch (error) {
            if (error.code !== "ENOENT") throw error;
          }
          const readyAt = Math.max(
            previous ? previous.lastStartedAt + ACCOUNT_READ_INTERVAL_MS : 0,
            previous?.retryNotBefore || 0,
          );
          if (readyAt > this.clock.now())
            await this.clock.wait(readyAt - this.clock.now(), signal);
          signal?.throwIfAborted();
          const startedAt = this.clock.now();
          await this.store.put(recordId, {
            kind: "account-rate",
            lastStartedAt: startedAt,
          });
          const result = await execute();
          const limited =
            result.httpStatus === 429 ||
            result.data?.status_code === 40202 ||
            result.data?.tasks?.some((task) => task.status_code === 40202);
          if (!limited) return result;
          await this.store.save(result.raw, {
            summary: {
              endpoint: "GET /v3/appendix/user_data",
              httpStatus: result.httpStatus,
              statusCode: result.data?.status_code,
              rateLimited: true,
            },
          });
          await this.store.put(recordId, {
            kind: "account-rate",
            lastStartedAt: startedAt,
            retryNotBefore:
              this.clock.now() +
              Math.max(
                ACCOUNT_RATE_RETRY_MS,
                Number.isFinite(result.retryAfterMs) ? result.retryAfterMs : 0,
              ),
          });
          if (attempt === ACCOUNT_READ_ATTEMPTS - 1) return result;
        }
      },
      signal,
      ACCOUNT_QUEUE_TIMEOUT_MS,
    );
  }
  async budget(signal) {
    const cap = this.config.dailyCapUsd ?? 0;
    if (!Number.isFinite(cap) || cap < 0)
      throw new Error("dailyCapUsd must be a finite nonnegative number");
    if (this.config.sandbox)
      return {
        capUsd: cap,
        spentUsd: 0,
        remainingUsd: cap,
        day: new Date().toISOString().slice(0, 10),
        sandbox: true,
      };
    const result = await this.transport(
      { method: "GET", path: "/v3/appendix/user_data" },
      undefined,
      {},
      signal,
    );
    const accountResultId = await this.store.save(result.raw, {
      summary: {
        endpoint: "GET /v3/appendix/user_data",
        httpStatus: result.httpStatus,
        statusCode: result.data?.status_code,
      },
    });
    const account = result.data?.tasks?.[0]?.result?.[0];
    const day = account?.money?.statistics?.day;
    if (
      result.httpStatus !== 200 ||
      result.data?.status_code !== 20000 ||
      result.data?.tasks?.[0]?.status_code !== 20000 ||
      !day ||
      typeof day !== "object" ||
      typeof day.value !== "string"
    )
      throw new Error(
        "Cannot verify total account daily spending; no paid request was sent",
      );
    const date = new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day.value) || day.value > date)
      throw new Error("Account spending date is invalid");
    let spent = day.value === date ? spendingTotal(day) : 0;
    const key = createHash("sha256")
      .update(this.credentials().login)
      .digest("hex")
      .slice(0, 24);
    let previous;
    try {
      previous = await this.store.get("budget-" + key);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (previous?.day === date) spent = Math.max(spent, previous.spentUsd);
    return {
      capUsd: cap,
      spentUsd: spent,
      remainingUsd: Math.max(0, cap - spent),
      day: date,
      scope: "total-account",
      accountResultId,
      ledgerKey: "budget-" + key,
    };
  }
  async request(
    { id, body, bindings = {}, wait = true, format = "json" },
    signal,
  ) {
    const item = endpoint(id);
    if (!item.formats.includes(format))
      throw new Error("Response format is not documented for this endpoint");
    if (item.method === "GET" && body !== undefined)
      throw new Error("GET requests do not accept a JSON body");
    let job,
      submissionStarted = false;
    if (item.path.endsWith("/task_post")) {
      job = {
        id: randomUUID(),
        kind: "job",
        createdAt: new Date().toISOString(),
        endpoint: id,
        bindings,
        state: "submitting",
        taskIds: [],
        resultIds: [],
      };
      await this.store.put(job.id, job);
    }
    const execute = async () => {
      const paid = item.paid && !this.config.sandbox;
      let budget;
      if (paid) {
        if ((this.config.dailyCapUsd ?? 0) <= 0)
          throw new Error(
            "Paid requests are disabled until dailyCapUsd is configured",
          );
        budget = await this.budget(signal);
        if (budget.spentUsd >= budget.capUsd)
          throw new Error("Daily DataForSEO account spending cap reached");
      }
      submissionStarted = true;
      const response = await this.transport(
        item,
        body,
        bindings,
        signal,
        format,
      );
      const tasks = Array.isArray(response.data)
        ? response.data
        : Array.isArray(response.data?.tasks)
          ? response.data.tasks
          : [];
      const summary = {
        endpoint: id,
        format,
        httpStatus: response.httpStatus,
        statusCode: response.data?.status_code,
        statusMessage: response.data?.status_message,
        costUsd: response.data?.cost,
        taskCount: tasks?.length,
        tasks: tasks?.slice(0, 25).map((t) => ({
          id: t?.id,
          statusCode: t?.status_code,
          statusMessage: t?.status_message,
          resultCount: t?.result_count,
          itemsCount: t?.result?.[0]?.items_count,
          crawlProgress: t?.result?.[0]?.crawl_progress,
        })),
        nextTaskOffset: tasks?.length > 25 ? 25 : null,
      };
      const resultId = await this.store.save(response.raw, { summary });
      if (budget) {
        const cost = response.data?.cost;
        if (typeof cost === "number" && Number.isFinite(cost) && cost >= 0)
          await this.store.put(budget.ledgerKey, {
            day: budget.day,
            spentUsd: budget.spentUsd + cost,
          });
      }
      if (job) {
        job.resultIds.push(resultId);
        job.taskIds = tasks
          .filter((t) => t?.id && t.status_code === 20100)
          .map((t) => t.id);
        job.failed = tasks.some((t) => t?.status_code >= 40000);
        job.state = job.taskIds.length ? "pending" : "failed";
        await this.store.put(job.id, job);
      }
      return {
        resultId,
        summary,
        ...(job ? { jobId: job.id, state: job.state } : {}),
      };
    };
    let result;
    try {
      const key = createHash("sha256")
        .update(this.credentials().login)
        .digest("hex")
        .slice(0, 24);
      result =
        item.paid && !this.config.sandbox
          ? await this.store.lock(key, execute, signal, ACCOUNT_QUEUE_TIMEOUT_MS)
          : await execute();
    } catch (error) {
      if (job) {
        job.state = submissionStarted ? "submission-uncertain" : "blocked";
        await this.store.put(job.id, job);
        const failure = new Error(
          error.message +
            "; job ID: " +
            job.id +
            " (submissions are never automatically replayed)",
          { cause: error },
        );
        failure.name = error.name;
        throw failure;
      }
      throw error;
    }
    if (job && wait && job.state === "pending")
      return { ...result, ...(await this.resume(job.id, signal)) };
    return result;
  }
  async resume(id, signal) {
    return this.store.lock(
      "job-" + id,
      () => this.resumeUnlocked(id, signal),
      signal,
    );
  }
  async track({ endpoint: id, taskIds }) {
    const item = endpoint(id);
    if (!item.path.endsWith("/task_post"))
      throw new Error("Track requires a task_post endpoint");
    if (
      !Array.isArray(taskIds) ||
      !taskIds.length ||
      taskIds.some((x) => typeof x !== "string" || !x)
    )
      throw new Error("Provide existing task IDs");
    const job = {
      id: randomUUID(),
      kind: "job",
      createdAt: new Date().toISOString(),
      endpoint: id,
      bindings: {},
      state: "pending",
      taskIds: [...new Set(taskIds)],
      resultIds: [],
    };
    await this.store.put(job.id, job);
    return job;
  }
  async resumeUnlocked(id, signal) {
    const job = await this.store.get(id);
    if (job.kind !== "job") throw new Error("ID is not an asynchronous job");
    if (!job.taskIds.length)
      return { jobId: id, state: job.state, resultIds: job.resultIds };
    const source = endpoint(job.endpoint),
      prefix = source.path.slice(0, -"/task_post".length) + "/task_get";
    const available = catalogue().operations.filter(
      (x) => x.method === "GET" && x.path.startsWith(prefix + "/"),
    );
    const selected =
      source.path === "/v3/on_page/task_post"
        ? endpoint("GET /v3/on_page/summary/{id}")
        : available.find((x) => x.path.includes("/advanced/")) ||
          available.find((x) => x.path.includes("/regular/")) ||
          available[0];
    if (!selected)
      return {
        jobId: id,
        state: "pending",
        taskIds: job.taskIds,
        resultIds: job.resultIds,
        reason:
          "No documented task-get route; use the catalogue to collect this task manually",
      };
    const controller = new AbortController(),
      timer = setTimeout(
        () => controller.abort(),
        this.config.workflowTimeoutMs || 120000,
      );
    const workflowSignal = signal
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal;
    const deadline = Date.now() + (this.config.workflowTimeoutMs || 120000);
    const completed = new Set(job.completedTaskIds || []);
    let failed = !!job.failed;
    try {
      while (Date.now() < deadline) {
        for (const taskId of job.taskIds.filter((x) => !completed.has(x))) {
          workflowSignal.throwIfAborted();
          const result = await this.request(
            {
              id: selected.id,
              bindings: { ...job.bindings, id: taskId },
              wait: false,
            },
            workflowSignal,
          );
          job.lastResultId = result.resultId;
          job.lastSummary = result.summary;
          const codes = result.summary.tasks?.map((t) => t.statusCode) || [];
          const responseOk =
            result.summary.httpStatus === 200 &&
            result.summary.statusCode === 20000;
          const crawling =
            source.path === "/v3/on_page/task_post" &&
            result.summary.tasks?.some(
              (t) =>
                t.statusCode === 20000 && t.crawlProgress !== "finished",
            );
          if (
            responseOk &&
            !crawling &&
            codes.length &&
            codes.every(
              (code) =>
                code === 20000 ||
                (![40601, 40602].includes(code) && code >= 40000),
            )
          ) {
            completed.add(taskId);
            job.resultIds.push(result.resultId);
            if (codes.some((code) => code !== 20000)) failed = true;
          }
          job.completedTaskIds = [...completed];
          job.failed = failed;
          await this.store.put(id, job);
        }
        job.completedTaskIds = [...completed];
        job.failed = failed;
        job.state =
          completed.size === job.taskIds.length
            ? failed
              ? "failed"
              : "complete"
            : "pending";
        await this.store.put(id, job);
        if (job.state !== "pending") break;
        await pause(this.config.pollIntervalMs || 3000, undefined, {
          signal: workflowSignal,
        });
      }
    } catch (error) {
      await this.store.put(id, job);
      if (!workflowSignal.aborted) throw error;
    } finally {
      clearTimeout(timer);
    }
    return {
      jobId: id,
      state: job.state,
      taskIds: job.taskIds,
      resultIds: job.resultIds,
    };
  }
}
