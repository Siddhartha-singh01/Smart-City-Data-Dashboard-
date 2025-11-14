const qs = s => document.querySelector(s)
const form = qs('#query-form')
const statusEl = qs('#status')
const avgTempEl = qs('#avg-temp')
const totalRainEl = qs('#total-rain')
const soilPhEl = qs('#soil-ph')
const aqiEl = qs('#aqi')
const pm25El = qs('#pm25')
const pm10El = qs('#pm10')
const trafficCongEl = qs('#traffic-congestion')
const trafficSpeedEl = qs('#traffic-speed')
const phFallback = qs('#soil-ph-fallback')
const manualPhInput = qs('#manual-ph')
const applyPhBtn = qs('#apply-ph')
const clearPhBtn = qs('#clear-ph')
const weatherFallback = qs('#weather-fallback')
const manualTempInput = qs('#manual-temp')
const manualRainInput = qs('#manual-rain')
const applyWeatherBtn = qs('#apply-weather')
const clearWeatherBtn = qs('#clear-weather')
const trafficFallback = qs('#traffic-fallback')
const manualCongInput = qs('#manual-congestion')
const manualSpeedInput = qs('#manual-speed')
const applyTrafficBtn = qs('#apply-traffic')
const clearTrafficBtn = qs('#clear-traffic')
const energyFallback = qs('#energy-fallback')
const manualDemandInput = qs('#manual-demand')
const manualSolarInput = qs('#manual-solar')
const manualWindInput = qs('#manual-wind')
const applyEnergyBtn = qs('#apply-energy')
const clearEnergyBtn = qs('#clear-energy')
const wasteFallback = qs('#waste-fallback')
const manualCollectionInput = qs('#manual-collection')
const manualRecyclingInput = qs('#manual-recycling')
const manualLandfillInput = qs('#manual-landfill')
const applyWasteBtn = qs('#apply-waste')
const clearWasteBtn = qs('#clear-waste')
const suggestionsEl = qs('#suggestions')
const submitBtn = qs('#query-form button[type="submit"]')
let rainChart
let airChart
let trafficChart
let energyChart
let wasteChart
let model = {lat:null,lon:null,avgTemp:null,totalRain:null,soilPh:null,aqi:null,pm25:null,pm10:null,traffic:{congestion:null,speed:null},energy:{demand:null,solar:null,wind:null},waste:{collection:null,recycling:null,landfill:null}}
const API_BASE = 'http://127.0.0.1:5501'
let suggestTimer

async function geocodeCity(apiKey, q){
  const u = `${API_BASE}/api/geocode?location=${encodeURIComponent(q)}`
  const r = await fetch(u)
  let j
  try{ j = await r.json() }catch{ j = null }
  if(!r.ok) throw new Error(j?.error || 'Geocoding failed')
  if(typeof j.lat !== 'number') throw new Error('Location not found')
  return {lat:j.lat, lon:j.lon, name:j.name}
}

async function fetchOneCall(apiKey, lat, lon){
  const u = `${API_BASE}/api/onecall?lat=${lat}&lon=${lon}`
  const r = await fetch(u)
  let j
  try{ j = await r.json() }catch{ j = null }
  if(!r.ok) throw new Error(j?.error || 'Weather fetch failed')
  return j
}

async function fetchSoilPh(lat, lon){
  const u = `${API_BASE}/api/soil?lat=${lat}&lon=${lon}`
  const r = await fetch(u)
  let j
  try{ j = await r.json() }catch{ j = null }
  if(!r.ok) throw new Error(j?.error || 'Soil pH fetch failed')
  const v = j?.ph ?? (j?.properties?.layers?.find(l=>l.name==='phh2o')?.depths?.[0]?.values?.mean)
  if(typeof v !== 'number') throw new Error('Soil pH not available')
  return v
}

async function fetchAirQuality(lat, lon){
  const u = `${API_BASE}/api/air?lat=${lat}&lon=${lon}`
  const r = await fetch(u)
  let j
  try{ j = await r.json() }catch{ j = null }
  if(!r.ok) throw new Error(j?.error || 'Air quality fetch failed')
  const t = Array.isArray(j.time)? j.time : []
  const p25 = Array.isArray(j.pm2_5)? j.pm2_5 : []
  const p10 = Array.isArray(j.pm10)? j.pm10 : []
  const aqi = Array.isArray(j.us_aqi)? j.us_aqi : []
  const n = Math.min(t.length, 24)
  const labels = t.slice(-n)
  const d25 = p25.slice(-n).map(x=>Number(x?.toFixed?.(1) || x))
  const d10 = p10.slice(-n).map(x=>Number(x?.toFixed?.(1) || x))
  const latestAqi = aqi.length? aqi[aqi.length-1] : null
  const latest25 = p25.length? p25[p25.length-1] : null
  const latest10 = p10.length? p10[p10.length-1] : null
  return {labels: labels.map(s=>new Date(s).toLocaleString()), pm25:d25, pm10:d10, aqi:latestAqi, latest25, latest10}
}

function computeRainfallDaily(daily){
  if(!Array.isArray(daily)) return {labels:[],data:[],total:0}
  const days = daily.slice(0,7)
  const labels = days.map(d=>new Date(d.dt*1000).toLocaleDateString())
  const data = days.map(d=>{
    if(typeof d.rain === 'number') return d.rain
    const p = d?.summary?.precipitation
    return typeof p === 'number' ? p : 0
  })
  const total = data.reduce((a,b)=>a+b,0)
  return {labels,data,total}
}

function computeAvgTemp(daily){
  if(!Array.isArray(daily)) return 0
  const days = daily.slice(0,7)
  const temps = days.map(d=>{
    const t = d.temp
    if(typeof t?.day === 'number') return t.day
    if(typeof t?.min === 'number' && typeof t?.max === 'number') return (t.min+t.max)/2
    return 0
  })
  const avg = temps.reduce((a,b)=>a+b,0)/temps.length
  return Number(avg.toFixed(1))
}

function scoreRange(x, min, max){
  if(x < min || x > max) return 0
  const mid = (min+max)/2
  const span = (max-min)/2
  return Math.max(0, 1 - Math.abs(x-mid)/span)
}

function recommendCrops(avgTemp, totalRain, soilPh){
  const defs = [
    {name:'Rice', temp:[18,26], rain:[70,200], ph:[5.0,6.5]},
    {name:'Wheat', temp:[10,20], rain:[20,60], ph:[6.0,7.5]},
    {name:'Maize', temp:[20,30], rain:[40,100], ph:[5.5,7.0]},
    {name:'Cotton', temp:[25,35], rain:[10,40], ph:[6.0,8.0]},
    {name:'Soybean', temp:[20,30], rain:[30,90], ph:[6.0,7.5]},
    {name:'Millets', temp:[25,35], rain:[0,30], ph:[5.0,7.5]}
  ]
  const items = defs.map(d=>{
    const sT = scoreRange(avgTemp, d.temp[0], d.temp[1])
    const sR = scoreRange(totalRain, d.rain[0], d.rain[1])
    const sP = scoreRange(soilPh, d.ph[0], d.ph[1])
    return {name:d.name, score:Number(((sT*0.4)+(sR*0.4)+(sP*0.2)).toFixed(2))}
  }).filter(x=>x.score>0.15)
  return items.sort((a,b)=>b.score-a.score)
}

function renderChart(labels, data){
  const ctx = qs('#rainChart')
  if(rainChart) rainChart.destroy()
  if(!labels.length){
    ctx.getContext('2d').clearRect(0,0,ctx.width,ctx.height)
    return
  }
  rainChart = new Chart(ctx,{type:'bar',data:{labels,datasets:[{label:'Rain (mm)',data,backgroundColor:'#22c55e'}]},options:{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}})
}

function renderAirChart(labels, pm25, pm10){
  const ctx = qs('#airChart')
  if(airChart) airChart.destroy()
  if(!labels.length){
    ctx.getContext('2d').clearRect(0,0,ctx.width,ctx.height)
    return
  }
  airChart = new Chart(ctx,{
    type:'line',
    data:{
      labels,
      datasets:[
        {label:'PM2.5', data:pm25, borderColor:'#22c55e', backgroundColor:'rgba(34,197,94,0.2)', tension:0.2},
        {label:'PM10', data:pm10, borderColor:'#60a5fa', backgroundColor:'rgba(96,165,250,0.2)', tension:0.2}
      ]
    },
    options:{plugins:{legend:{display:true}}, scales:{y:{beginAtZero:true}}, maintainAspectRatio:false}
  })
}

function renderRecommendations(list){
  const el = qs('#crop-list')
  el.innerHTML = ''
  if(!list.length){
    el.innerHTML = '<li>No strong matches. Adjust pH or check forecast.</li>'
    return
  }
  list.forEach(i=>{
    const li = document.createElement('li')
    const n = document.createElement('div')
    n.textContent = i.name
    const s = document.createElement('div')
    s.className = 'score'
    s.textContent = `Match: ${(i.score*100).toFixed(0)}%`
    li.appendChild(n)
    li.appendChild(s)
    el.appendChild(li)
  })
}

function updateMetrics(){
  avgTempEl.textContent = model.avgTemp!=null?model.avgTemp:'—'
  totalRainEl.textContent = model.totalRain!=null?model.totalRain:'—'
  soilPhEl.textContent = model.soilPh!=null?model.soilPh:'—'
  aqiEl.textContent = model.aqi!=null?model.aqi:'—'
  pm25El.textContent = model.pm25!=null?Number(model.pm25.toFixed(1)):'—'
  pm10El.textContent = model.pm10!=null?Number(model.pm10.toFixed(1)):'—'
  trafficCongEl.textContent = model.traffic.congestion!=null?Math.round(model.traffic.congestion):'—'
  trafficSpeedEl.textContent = model.traffic.speed!=null?Math.round(model.traffic.speed):'—'
  qs('#energy-demand').textContent = model.energy.demand!=null?Math.round(model.energy.demand):'—'
  qs('#energy-solar').textContent = model.energy.solar!=null?Math.round(model.energy.solar):'—'
  qs('#energy-wind').textContent = model.energy.wind!=null?Math.round(model.energy.wind):'—'
  qs('#waste-collection').textContent = model.waste.collection!=null?Math.round(model.waste.collection):'—'
  qs('#waste-recycling').textContent = model.waste.recycling!=null?Math.round(model.waste.recycling):'—'
  qs('#waste-landfill').textContent = model.waste.landfill!=null?Math.round(model.waste.landfill):'—'
}

applyPhBtn.addEventListener('click',()=>{
  const v = parseFloat(manualPhInput.value)
  if(!isNaN(v)){
    model.soilPh = Number(v.toFixed(2))
    updateMetrics()
  }
})

clearPhBtn.addEventListener('click',()=>{
  manualPhInput.value = ''
  model.soilPh = null
  phFallback.classList.add('hidden')
  updateMetrics()
})

applyWeatherBtn.addEventListener('click',()=>{
  const t = parseFloat(manualTempInput.value)
  const r = parseFloat(manualRainInput.value)
  if(!isNaN(t)) model.avgTemp = Number(t.toFixed(1))
  if(!isNaN(r)) model.totalRain = Number(r.toFixed(1))
  if(!isNaN(r)) {}
  updateMetrics()
})

clearWeatherBtn.addEventListener('click',()=>{
  manualTempInput.value = ''
  manualRainInput.value = ''
  model.avgTemp = null
  model.totalRain = null
  weatherFallback.classList.add('hidden')
  
  updateMetrics()
})

applyTrafficBtn.addEventListener('click',()=>{
  const c = parseFloat(manualCongInput.value)
  const s = parseFloat(manualSpeedInput.value)
  if(!isNaN(c)) model.traffic.congestion = Math.max(0, Math.min(100, c))
  if(!isNaN(s)) model.traffic.speed = Math.max(0, s)
  const labels = ['Manual']
  renderTrafficChart(labels, [model.traffic.congestion||0])
  updateMetrics()
})

clearTrafficBtn.addEventListener('click',()=>{
  manualCongInput.value = ''
  manualSpeedInput.value = ''
  model.traffic.congestion = null
  model.traffic.speed = null
  trafficFallback.classList.add('hidden')
  renderTrafficChart([], [])
  updateMetrics()
})

applyEnergyBtn.addEventListener('click',()=>{
  const d = parseFloat(manualDemandInput.value)
  const so = parseFloat(manualSolarInput.value)
  const wi = parseFloat(manualWindInput.value)
  if(!isNaN(d)) model.energy.demand = Math.max(0, d)
  if(!isNaN(so)) model.energy.solar = Math.max(0, so)
  if(!isNaN(wi)) model.energy.wind = Math.max(0, wi)
  const labels = ['Manual']
  renderEnergyChart(labels, [model.energy.demand||0], [model.energy.solar||0], [model.energy.wind||0])
  updateMetrics()
})

clearEnergyBtn.addEventListener('click',()=>{
  manualDemandInput.value = ''
  manualSolarInput.value = ''
  manualWindInput.value = ''
  model.energy.demand = null
  model.energy.solar = null
  model.energy.wind = null
  energyFallback.classList.add('hidden')
  renderEnergyChart([], [], [], [])
  updateMetrics()
})

applyWasteBtn.addEventListener('click',()=>{
  const co = parseFloat(manualCollectionInput.value)
  const re = parseFloat(manualRecyclingInput.value)
  const la = parseFloat(manualLandfillInput.value)
  if(!isNaN(co)) model.waste.collection = Math.max(0, co)
  if(!isNaN(re)) model.waste.recycling = Math.max(0, Math.min(100, re))
  if(!isNaN(la)) model.waste.landfill = Math.max(0, Math.min(100, la))
  renderWasteChart(model.waste.collection||0, model.waste.recycling||0, model.waste.landfill||0)
  updateMetrics()
})

clearWasteBtn.addEventListener('click',()=>{
  manualCollectionInput.value = ''
  manualRecyclingInput.value = ''
  manualLandfillInput.value = ''
  model.waste.collection = null
  model.waste.recycling = null
  model.waste.landfill = null
  wasteFallback.classList.add('hidden')
  renderWasteChart(0, 0, 0)
  updateMetrics()
})

qs('#location').addEventListener('input', e=>{
  const q = e.target.value.trim()
  suggestionsEl.innerHTML = ''
  suggestionsEl.classList.add('hidden')
  if(suggestTimer) clearTimeout(suggestTimer)
  if(q.length < 2) return
  suggestTimer = setTimeout(async ()=>{
    try{
      const u = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json`
      const r = await fetch(u)
      const j = await r.json()
      const list = (j.results||[]).map(x=>({name:x.name, country:x.country}))
      if(!list.length) return
      suggestionsEl.innerHTML = ''
      list.forEach(it=>{
        const li = document.createElement('li')
        li.textContent = `${it.name}${it.country?`, ${it.country}`:''}`
        li.addEventListener('click',()=>{
          qs('#location').value = li.textContent
          suggestionsEl.classList.add('hidden')
        })
        suggestionsEl.appendChild(li)
      })
      suggestionsEl.classList.remove('hidden')
    }catch{}
  }, 250)
})

window.addEventListener('click', e=>{
  if(!suggestionsEl.contains(e.target) && e.target !== qs('#location')){
    suggestionsEl.classList.add('hidden')
  }
})

form.addEventListener('submit', async e=>{
  e.preventDefault()
  const q = qs('#location').value.trim()
  statusEl.textContent = 'Fetching location…'
  submitBtn.setAttribute('disabled','true')
  phFallback.classList.add('hidden')
  try{
    const loc = await geocodeCity('', q)
    model.lat = loc.lat
    model.lon = loc.lon
    statusEl.textContent = 'Fetching weather…'
    try{
      const weather = await fetchOneCall('', loc.lat, loc.lon)
      const rain = computeRainfallDaily(weather.daily)
      const avgT = computeAvgTemp(weather.daily)
      model.avgTemp = avgT
      model.totalRain = Number(rain.total.toFixed(1))
      
    }catch(err){
      model.avgTemp = null
      model.totalRain = null
      weatherFallback.classList.remove('hidden')
      statusEl.textContent = 'Weather unavailable. Enter temp and rainfall manually.'
    }
    statusEl.textContent = 'Fetching soil pH…'
    try{
      const pH = await fetchSoilPh(loc.lat, loc.lon)
      model.soilPh = Number(pH.toFixed(2))
    }catch(err){
      model.soilPh = null
      phFallback.classList.remove('hidden')
      statusEl.textContent = 'Soil pH unavailable. Enter manually.'
    }
    statusEl.textContent = 'Fetching air quality…'
    try{
      const aq = await fetchAirQuality(loc.lat, loc.lon)
      const labels = aq.labels
      model.aqi = aq.aqi!=null? Math.round(aq.aqi) : null
      model.pm25 = aq.latest25!=null? aq.latest25 : null
      model.pm10 = aq.latest10!=null? aq.latest10 : null
      renderAirChart(labels, aq.pm25, aq.pm10)
    }catch(err){
      model.aqi = null
      model.pm25 = null
      model.pm10 = null
      renderAirChart([], [], [])
    }
    statusEl.textContent = 'Traffic data…'
    try{
      const labels = Array.from({length:24}, (_,i)=>`${i}:00`)
      const congestion = labels.map((_,i)=> Math.max(10, Math.min(95, 20+Math.sin(i/3)*30 + (i>7 && i<10?25:0) + (i>17 && i<20?30:0))))
      model.traffic.congestion = congestion[congestion.length-1]
      model.traffic.speed = Math.max(10, 60 - model.traffic.congestion*0.4)
      renderTrafficChart(labels, congestion)
    }catch{}
    statusEl.textContent = 'Energy data…'
    try{
      const labels = Array.from({length:24}, (_,i)=>`${i}:00`)
      const solar = labels.map((_,i)=> i>6 && i<18 ? (Math.sin((i-6)/12*Math.PI)*400).toFixed(0) : 0).map(Number)
      const wind = labels.map((_,i)=> (200 + Math.sin(i/2)*80 + Math.random()*30).toFixed(0)).map(Number)
      const demand = labels.map((_,i)=> (800 + Math.sin(i/3)*120 + (i>17 && i<21?150:0)).toFixed(0)).map(Number)
      model.energy.solar = solar[solar.length-1]
      model.energy.wind = wind[wind.length-1]
      model.energy.demand = demand[demand.length-1]
      renderEnergyChart(labels, demand, solar, wind)
    }catch{}
    statusEl.textContent = 'Waste data…'
    try{
      model.waste.collection = 250
      model.waste.recycling = 35
      model.waste.landfill = 50
      renderWasteChart(model.waste.collection, model.waste.recycling, model.waste.landfill)
    }catch{}
    updateMetrics()
    statusEl.textContent = 'Done.'
  }catch(err){
    statusEl.textContent = 'Error: '+err.message
  }
  submitBtn.removeAttribute('disabled')
  try{ localStorage.setItem('lastLocation', q) }catch{}
})

window.addEventListener('DOMContentLoaded',()=>{
  try{
    const last = localStorage.getItem('lastLocation')
    if(last) qs('#location').value = last
  }catch{}
  ;(function(){
    const els = document.querySelectorAll('.card, header')
    els.forEach(el=>{
      el.addEventListener('mousemove', e=>{
        const r = el.getBoundingClientRect()
        const x = e.clientX - r.left
        const y = e.clientY - r.top
        const rx = ((r.height/2 - y)/r.height)*8
        const ry = ((x - r.width/2)/r.width)*8
        el.style.setProperty('--rx', rx+'deg')
        el.style.setProperty('--ry', ry+'deg')
        el.style.setProperty('--tz', '18px')
      })
      el.addEventListener('mouseleave', ()=>{
        el.style.setProperty('--rx','0deg')
        el.style.setProperty('--ry','0deg')
        el.style.setProperty('--tz','0px')
      })
    })
  })()
})
function renderTrafficChart(labels, congestion){
  const ctx = qs('#trafficChart')
  if(trafficChart) trafficChart.destroy()
  if(!labels.length){
    ctx.getContext('2d').clearRect(0,0,ctx.width,ctx.height)
    return
  }
  trafficChart = new Chart(ctx,{type:'line',data:{labels,datasets:[{label:'Congestion %',data:congestion,borderColor:'#f59e0b',backgroundColor:'rgba(245,158,11,0.2)',tension:0.2}]},options:{plugins:{legend:{display:true}},scales:{y:{beginAtZero:true,max:100}},maintainAspectRatio:false}})
}

function renderEnergyChart(labels, demand, solar, wind){
  const ctx = qs('#energyChart')
  if(energyChart) energyChart.destroy()
  if(!labels.length){
    ctx.getContext('2d').clearRect(0,0,ctx.width,ctx.height)
    return
  }
  energyChart = new Chart(ctx,{type:'line',data:{labels,datasets:[
    {label:'Demand (MW)',data:demand,borderColor:'#e5e7eb',backgroundColor:'rgba(229,231,235,0.15)',tension:0.2},
    {label:'Solar (MW)',data:solar,borderColor:'#d4af37',backgroundColor:'rgba(212,175,55,0.2)',tension:0.2},
    {label:'Wind (MW)',data:wind,borderColor:'#60a5fa',backgroundColor:'rgba(96,165,250,0.2)',tension:0.2}
  ]},options:{plugins:{legend:{display:true}},scales:{y:{beginAtZero:true}},maintainAspectRatio:false}})
}

function renderWasteChart(collection, recycling, landfill){
  const ctx = qs('#wasteChart')
  if(wasteChart) wasteChart.destroy()
  wasteChart = new Chart(ctx,{type:'doughnut',data:{labels:['Recycling %','Landfill %'],datasets:[{data:[recycling||0,landfill||0],backgroundColor:['#22c55e','#ef4444']}]} ,options:{plugins:{legend:{display:true}},maintainAspectRatio:false}})
}
