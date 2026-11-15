import json,datetime,pathlib
raw=pathlib.Path('src/data/raw');out=pathlib.Path('src/data/chapters')
archive=['sep2017'];seen=set();total=0
may=json.loads((out/'may2024.json').read_text());may_by_date={d['date']:d for d in may['days']}
def rank(f):
 c=f.get('classType') or 'A0';return 'ABCMX'.find(c[0])*1000+float(c[1:])
for year in (2022,2023,2024):
 for month in range(1,13):
  start=datetime.date(year,month,1);following=datetime.date(year+1,1,1) if month==12 else datetime.date(year,month+1,1);end=following-datetime.timedelta(days=1)
  filename=f'donki-flr-{start}_{end}.json';records=json.loads((raw/filename).read_text());days=[]
  for i in range((end-start).days+1):
   date=str(start+datetime.timedelta(days=i));flares=sorted([f for f in records if (f.get('peakTime') or '')[:10]==date],key=lambda f:f['peakTime']);best=max(flares,key=rank) if flares else None
   large=[{'peakTime':f['peakTime'],'classType':f['classType']} for f in flares if rank(f)>=3035] # reset threshold below
   large=[{'peakTime':f['peakTime'],'classType':f['classType']} for f in flares if (f.get('classType','').startswith('X') or f.get('classType','').startswith('M') and float(f['classType'][1:])>=5)]
   d={'date':date,'sunlight':1,'radiation':3 if date=='2024-05-20' else 0,'flare':'major' if any(f.get('classType','').startswith('X') for f in flares) else 'strong' if large else 'none','flares':large,'flareCount':len(flares),'notes':'Mars surface radiation is not established for this date by these flare records. Radiation 0 and sunlight 1 are game baselines, not measurements.','sourceFile':filename}
   if best:d['strongest']={'peakTime':best['peakTime'],'classType':best['classType']}
   else:d['notes']='The fetched DONKI response holds no flare record for this UTC date. '+d['notes']
   if date in may_by_date and 'cardId' in may_by_date[date]:d['cardId']=may_by_date[date]['cardId']
   if date=='2024-05-20':d['notes']='NASA reported a radiation surge measured by Curiosity on Mars on 20 May 2024. Level 3 is a game mapping. The later estimated X12 flare is not in the fetched DONKI response.'
   days.append(d);seen.add(date)
  id=f'archive-{year}-{month:02}';c={'id':id,'title':start.strftime('%B %Y')+' records','site':'mars','startDate':str(start),'setup':'Build your outpost through another month of archived solar observations.','days':days,'simplified':['Flare records describe solar observations, not Mars surface radiation.','Unmeasured radiation and sunlight use game baselines.','Equipment incidents, damage, forecasts, production and the outpost are simulated.','One sol represents one Earth date.']}
  (out/f'{id}.json').write_text(json.dumps(c,indent=2)+'\n');archive.append(id)
pathlib.Path('src/data/archive.json').write_text(json.dumps(archive,indent=2)+'\n')
pathlib.Path('docs/takeover/ARCHIVE_COVERAGE.json').write_text(json.dumps({'unique2022to2024Dates':len(seen),'totalUniqueDates':len(seen)+14,'months':36,'rawFiles':36,'start':'2022-01-01','end':'2024-12-31','missingImports':[]},indent=2)+'\n')
print(len(seen),'unique imported dates; 1110 including September 2017')
