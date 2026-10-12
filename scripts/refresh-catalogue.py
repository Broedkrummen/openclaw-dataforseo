"""Generate a factual catalogue from a reviewed OpenAPI and Firecrawl snapshot."""
import argparse
import hashlib
import datetime
import html
import json
import pathlib
import re
import yaml

parser = argparse.ArgumentParser()
parser.add_argument('--spec', required=True)
parser.add_argument('--coverage', required=True)
parser.add_argument('--fields', required=True)
parser.add_argument('--databases', required=True)
parser.add_argument('--version', default=datetime.date.today().isoformat())
parser.add_argument('--source-commit', default='702356d7be30374c95c4353c32345c61c6d7c1df')
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parent.parent
coverage = json.loads(pathlib.Path(args.coverage).read_text())
if coverage['missingMenu'] or coverage['missingLlms']:
    raise SystemExit('Coverage gate failed: menu or supplementary index pages remain unread')
spec = yaml.load(pathlib.Path(args.spec).read_text(), Loader=yaml.CBaseLoader)
fields = {entry['url']: entry['fields'] for entry in json.loads(pathlib.Path(args.fields).read_text())}

def structural(value):
    if isinstance(value, list):
        return [structural(x) for x in value]
    if not isinstance(value, dict):
        return value
    result = {}
    for key, item in value.items():
        if key in ['description', 'summary', 'example', 'examples', 'title']:
            continue
        if key in ['nullable', 'readOnly', 'writeOnly', 'deprecated', 'additionalProperties', 'required'] and item in ['true', 'false']:
            item = item == 'true'
        result[key] = structural(item)
    return result

operations = {}
for path, methods in spec['paths'].items():
    for method, value in methods.items():
        if method not in ['get', 'post', 'put', 'patch', 'delete']:
            continue
        identity = method.upper() + ' ' + path
        operations[identity] = {'id': identity, 'method': method.upper(), 'path': path, 'family': path.split('/')[2], 'sources': [], 'fields': [], 'requestSchema': structural(value.get('requestBody', {}).get('content', {}).get('application/json', {}).get('schema')), 'responseSchema': structural(value.get('responses', {}).get('200', {}).get('content', {}).get('application/json', {}).get('schema')), 'parameters': structural(methods.get('parameters', []) + value.get('parameters', [])), 'paid': True}

guides = []
document_manifest = []
for url, evidence in coverage['documents'].items():
    document = json.loads(pathlib.Path(evidence['file']).read_text())
    markdown = document['markdown']
    head = markdown[:6000].replace('\\_', '_')
    matches = [m.groups() for m in re.finditer(r'\b(GET|POST)\s+https://api\.dataforseo\.com([^\s`<>"\)]+)', markdown.replace('\\_', '_')) if m.start() < 5000]
    parsed_fields = []
    for row in fields.get(url, []):
        name = html.unescape(re.sub('<[^>]*>', '', row['field'])).strip('` -*−└├│ ').replace('`', '')
        description = row['description']
        facts = {'name': name, 'type': html.unescape(re.sub('<[^>]*>', '', row['type'])), 'requiredMention': 'required field' in description and 'optional field' not in description}
        facts['conditional'] = bool(re.search(r'(if |unless |required.*(when|either)|one of)', description, re.I))
        # Capture literal values without republishing the provider's prose.
        literals = re.findall(r'`([^`]+)`', description)
        if literals:
            facts['documentedLiterals'] = list(dict.fromkeys(literals))
        parsed_fields.append(facts)
    guides.append({'id': 'doc:' + url.split('/v3/', 1)[1].strip('/'), 'source':url, 'family':url.split('/v3/',1)[1].split('/')[0], 'fields':parsed_fields})
    document_manifest.append({'url':url,'retrievedUrl':document.get('metadata',{}).get('sourceURL',url),'status':200,'characters':len(markdown),'sha256':hashlib.sha256(markdown.encode()).hexdigest(),'fieldCount':len(parsed_fields)})
    # Some pages put the method and URL on distinct lines; whitespace includes both.
    path_from_url = '/v3/' + url.split('/v3/', 1)[1].strip('/')
    normalized = lambda path: re.sub(r'/\{[^}]+\}', '', path).rstrip('/')
    candidates = [x for x in operations.values() if normalized(x['path']) == path_from_url]
    for method, path in ([] if '/appendix/ai_optimized_response/' in url else matches[:1]):
        dynamic = []
        if '$path' in path:
            # The dynamic-field table supplies the allowed values in backticks.
            table = re.search(r'^\|\s*`path`\s*\|([^\n]+)',head,re.M)
            section = table[1] if table else ''
            allowed = re.findall(r'`([^`]+)`',section)
            allowed = [x for x in allowed if x not in ['path','id'] and re.fullmatch('[a-z_]+(?:/[a-z_]+)*',x)]
            dynamic = [path.replace('$path',x) for x in allowed]
        path = re.sub(r'\$(id|country|country_code)\b', r'{\1}', path).rstrip('/')
        for concrete in dynamic or [path]:
            if not concrete.startswith('/v3/') or '$' in concrete:
                continue
            identity = method + ' ' + concrete
            if identity not in operations:
                operations[identity] = {'id': identity, 'method': method, 'path': concrete, 'family': concrete.split('/')[2], 'sources': [], 'fields': [], 'parameters': [], 'paid': True, 'requestSchema': None, 'responseSchema': None, 'schemaSupplement': True}
            if operations[identity] not in candidates:
                candidates.append(operations[identity])
    for operation in candidates:
        if url not in operation['sources']:
            operation['sources'].append(url)
        intro = head.split('Description of the fields',1)[0].split('| Field name',1)[0]
        if re.search(r'legacy version|\(Legacy\)|has been replaced|endpoint (is|has been).*deprecated',intro,re.I):
            operation['legacy'] = True
        if len(parsed_fields) > len(operation['fields']):
            operation['fields'] = parsed_fields
        cost_paragraphs = [line for line in head.split('\n') if 'sandbox' not in line.lower()]
        pricing = '\n'.join(cost_paragraphs)
        collection = operation['method']=='GET' or (operation['family']=='on_page' and not re.search(r'/(task_post|instant_pages|lighthouse|content_parsing/live)$', operation['path']))
        if re.search(r'Your account will not be charged|Your account is not charged|You will not be charged for using this API|This API is free of charge', pricing, re.I) or (collection and re.search(r'charged only for (posting|setting) a task',pricing,re.I)):
            operation['paid'] = False

# Grouped appendix pages document concrete routes rather than a callable /appendix route.
for suffix, families in [('id_list', ['serp','keywords_data','dataforseo_labs','backlinks','on_page','content_analysis','domain_analytics','merchant','app_data','business_data','ai_optimization']), ('errors', ['serp','keywords_data','dataforseo_labs','backlinks','on_page','content_analysis','domain_analytics','merchant','app_data','business_data','ai_optimization'])]:
    source = 'https://docs.dataforseo.com/v3/appendix/' + ('api_errors' if suffix == 'errors' else suffix) + '/'
    for family in families:
        path = '/v3/' + family + '/' + suffix
        identity = 'POST ' + path
        if identity not in operations:
            operations[identity] = {'id':identity,'method':'POST','path':path,'family':family,'sources':[source],'fields':[],'parameters':[],'paid':False,'schemaSupplement':True,'requestSchema':None,'responseSchema':None}
        elif source not in operations[identity]['sources']:
            operations[identity]['sources'].append(source)
        supplement = next((x for x in guides if x['source']==source), None)
        if supplement and not operations[identity]['fields']:
            operations[identity]['fields'] = supplement['fields']
for operation in operations.values():
    if not operation['sources']:
        operation['sources'] = ['https://github.com/dataforseo/OpenApiDocumentation/blob/' + args.source_commit + '/openapi_specification.yaml']
        operation['openApiOnly'] = True
    # The provider identifies the whole Google AdWords API as legacy, including
    # collector pages whose introductions omit the family-wide migration notice.
    if operation['path'].startswith('/v3/keywords_data/google/'):
        operation['legacy'] = True
    if operation['method'] == 'GET' and (operation['path'].endswith('/appendix/user_data') or re.search(r'/(locations|languages|categories|tasks_ready|status)(/\{[^}]+\})?$',operation['path'])):
        operation['paid'] = False
    if operation['path'].endswith('/id_list') or operation['path'].endswith('/errors'):
        operation['paid'] = False
    operation['formats'] = ['json']
    if '/live' in operation['path'] or '/task_get/' in operation['path'] or '/locations' in operation['path']:
        operation['formats'].append('ai')

database_facts = json.loads(pathlib.Path(args.databases).read_text())
if isinstance(database_facts, dict):
    database_facts = database_facts.get('datasets', database_facts.get('entries', []))
datasets = []
for entry in database_facts:
    url = entry['documentationUrl']
    guide = next(x for x in guides if x['source']==url)
    datasets.append({'id':url.split('/databases/',1)[1].strip('/'),'source':url,'fields':guide['fields'],'formats':entry['formats'],'sampleUrls':entry['sampleUrls'],'compression':entry['sampleCompressionFromSuffix']})
output = root / 'data'
output.mkdir(exist_ok=True)
(output/'catalogue.json').write_text(json.dumps({'version':args.version,'operations':list(operations.values()),'datasets':datasets,'guides':guides},separators=(',',':'))+'\n')
(output/'schemas.json').write_text(json.dumps(structural(spec.get('components',{}).get('schemas',{})),separators=(',',':'))+'\n')
report = {key:value for key,value in coverage.items() if key not in ['documents','failures']}
report['failures'] = {url:{'statusCode':entry.get('statusCode')} for url,entry in coverage['failures'].items()}
report['operationCount'] = len(operations)
report['schemaCount'] = len(spec.get('components',{}).get('schemas',{}))
report['datasetCount'] = len(datasets)
missing_workflows = [x['id'] for x in operations.values() if x['path'].endswith('/task_post') and x['family']!='on_page' and not any(y['method']=='GET' and y['path'].startswith(x['path'][:-len('/task_post')]+'/task_get/') for y in operations.values())]
report['workflowsWithoutDocumentedCollector'] = missing_workflows
report['version'] = args.version
report['source'] = 'https://github.com/dataforseo/OpenApiDocumentation/commit/' + args.source_commit
report['specificationSha256'] = hashlib.sha256(pathlib.Path(args.spec).read_bytes()).hexdigest()
(output/'coverage.json').write_text(json.dumps(report,indent=2)+'\n')
(output/'documentation-manifest.json').write_text(json.dumps(document_manifest,indent=2)+'\n')
print(json.dumps({'operations':len(operations),'schemas':report['schemaCount'],'datasets':len(datasets),'menuCoverage':str(coverage['menuCovered'])+'/'+str(coverage['menuExpected'])}))
