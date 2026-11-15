import urllib.request,json,datetime,pathlib,time
base='https://ccmc.gsfc.nasa.gov/DONKI-API/get/FLR'
raw=pathlib.Path('src/data/raw'); out=pathlib.Path('src/data/chapters')
for year in (2022,2023,2024):
 for month in range(1,13):
  start=datetime.date(year,month,1); following=datetime.date(year+1,1,1) if month==12 else datetime.date(year,month+1,1);end=following-datetime.timedelta(days=1)
  url=f'{base}?startDate={start}&endDate={end}';file=raw/f'donki-flr-{start}_{end}.json'
  if not file.exists():
   for attempt in range(3):
    try:
     body=urllib.request.urlopen(url,timeout=35).read();records=json.loads(body)
     if not isinstance(records,list):raise ValueError('not array')
     file.write_bytes(body);file.with_suffix('.meta.json').write_text(json.dumps({'sourceUrl':url,'fetchedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'query':{'type':'FLR','startDate':str(start),'endDate':str(end)}},indent=2));break
    except Exception:
     if attempt==2:raise
     time.sleep(1)
  print(str(start),flush=True)
