'use strict';
(() => {
  const STORAGE_KEY = 'clock_plan_v2_local_data';
  const el = id => document.getElementById(id);
  const fa = n => new Intl.NumberFormat('fa-IR', {useGrouping:false}).format(n);
  const pad = n => String(Math.floor(Math.abs(n))).padStart(2, '0').replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
  const jd = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {year:'numeric',month:'long',day:'numeric',weekday:'long'});
  const jp = new Intl.DateTimeFormat('en-US-u-ca-persian', {year:'numeric',month:'numeric'});
  const CIRCLE_LENGTH = 2 * Math.PI * 183;
  const cloneSafe = v => JSON.parse(JSON.stringify(v));
  function keyFromDate(date) {return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
  function dateFromKey(key) {const [y,m,d] = key.split('-').map(Number);return new Date(y,m-1,d,12);}
  function addDays(key, count) {const d=dateFromKey(key);d.setDate(d.getDate()+count);return keyFromDate(d);}
  function businessKey(date = new Date()) {const d=new Date(date);d.setHours(d.getHours()-2);return keyFromDate(d);}
  function persianYM(key) {const parts=jp.formatToParts(dateFromKey(key));return `${parts.find(p=>p.type==='year')?.value}-${parts.find(p=>p.type==='month')?.value}`;}
  function duration(seconds) {
    const min=Math.floor(Math.max(0, seconds)/60);const h=Math.floor(min/60);const m=min%60;
    if(h && m) return `${fa(h)} ساعت و ${fa(m)} دقیقه`;
    if(h) return `${fa(h)} ساعت`;
    return `${fa(m)} دقیقه`;
  }
  function timerDuration(seconds) {
    const s=Math.floor(Math.max(0,seconds));return [Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(pad).join(':');
  }
  const initialData = {version:2, goalHours:8, days:{}, timerStart:null};
  function load() {
    try {
      const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY));
      if(parsed && parsed.version===2 && parsed.days && typeof parsed.days==='object') {
        return {version:2,goalHours:Math.min(24,Math.max(.5,Number(parsed.goalHours)||8)),days:parsed.days,timerStart:Number(parsed.timerStart)||null};
      }
    } catch(_err) {}
    return cloneSafe(initialData);
  }
  let state=load();
  let chosenDay=businessKey();
  let viewingLive=true;
  let selectedNumber=12;
  let selectedHalf=0;
  let lastBusinessDay=businessKey();
  let flashTimeout;

  function notify(msg) {el('toast').textContent=msg;clearTimeout(flashTimeout);flashTimeout=setTimeout(()=>el('toast').textContent='',4500);}
  function save() {try {localStorage.setItem(STORAGE_KEY,JSON.stringify(state));return true;}catch(e){notify('فضای ذخیره‌سازی کافی نیست؛ همین حالا از اطلاعات بکاپ بگیر.');return false;}}
  function dayData(key, create=false) {
    if(!state.days[key] && create) state.days[key]={tasks:[], sessions:[]};
    return state.days[key] || {tasks:[],sessions:[]};
  }
  function hour24() {return selectedHalf===0 ? (selectedNumber===12 ? 0:selectedNumber) : (selectedNumber===12 ? 12:selectedNumber+12);}
  function clockLabel(h) {
    if (h === 0) return '۱۲ شب';
    if (h < 12) return `${fa(h)} صبح`;
    if (h === 12) return '۱۲ ظهر';
    return `${fa(h-12)} عصر`;
  }
  function selectedHourLabel() {return clockLabel(hour24());}
  function formatDate(key) {return jd.format(dateFromKey(key));}
  function dayTotal(key) {return (dayData(key).sessions||[]).reduce((a,s)=>a+(Number(s.seconds)||0),0);}
  function runningTotal(key) {
    if(!state.timerStart) return 0;
    return splitInterval(state.timerStart,Date.now()).filter(s=>s.day===key).reduce((a,s)=>a+s.seconds,0);
  }
  function nextCutoff(ts) {
    const base=dateFromKey(businessKey(new Date(ts)));
    base.setDate(base.getDate()+1);
    base.setHours(2,0,0,0);
    return base.getTime();
  }
  function splitInterval(start,end) {
    const result=[];
    if(!Number.isFinite(start)||!Number.isFinite(end)||start>=end) return result;
    let t=start, iterations=0;
    while(t<end && iterations++<1000) {
      const cutoff=nextCutoff(t);
      const until=Math.min(end,cutoff);
      if(until<=t) break;
      result.push({day:businessKey(new Date(t)),seconds:(until-t)/1000});
      t=until;
    }
    return result;
  }
  function selectedTotals() {
    const todaySeconds=dayTotal(chosenDay)+runningTotal(chosenDay);
    const selectedDate=dateFromKey(chosenDay);
    const weekday=selectedDate.getDay();
    const offset=(weekday+1)%7; // Saturday to Friday
    const weekStart=addDays(chosenDay,-offset);
    const currentJalaliMonth=persianYM(chosenDay);
    const days=new Set([...Object.keys(state.days),...(state.timerStart?splitInterval(state.timerStart,Date.now()).map(x=>x.day):[])]);
    let weekly=0,monthly=0;
    for(const day of days){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
      const amount=dayTotal(day)+runningTotal(day);
      if(day>=weekStart && day<addDays(weekStart,7))weekly+=amount;
      if(persianYM(day)===currentJalaliMonth)monthly+=amount;
    }
    return {todaySeconds,weekly,monthly};
  }
  function updateSummary() {
    const totals=selectedTotals();
    const target=state.goalHours*3600;
    const ratio=Math.max(0,Math.min(1,totals.todaySeconds/target));
    el('progressArc').setAttribute('stroke-dasharray',String(CIRCLE_LENGTH));
    el('progressArc').setAttribute('stroke-dashoffset',String(CIRCLE_LENGTH*(1-ratio)));
    el('ringText').textContent=`${duration(totals.todaySeconds)} از ${fa(state.goalHours)} ساعت`;
    el('dailyTotal').textContent=duration(totals.todaySeconds);
    el('weeklyTotal').textContent=duration(totals.weekly);
    el('monthlyTotal').textContent=duration(totals.monthly);
    el('dailyTitle').textContent=chosenDay===businessKey()?'مطالعه امروز':'مطالعه این روز';
    el('taskDayLabel').textContent=chosenDay===businessKey()?'امروز':'این روز';
  }
  function placeHands(now) {
    const sec=now.getSeconds(), min=now.getMinutes()+sec/60, hr=now.getHours()%12+min/60;
    el('secondHand').setAttribute('transform',`rotate(${sec*6} 200 200)`);
    el('minuteHand').setAttribute('transform',`rotate(${min*6} 200 200)`);
    el('hourHand').setAttribute('transform',`rotate(${hr*30} 200 200)`);
    el('digitalTime').textContent=[now.getHours(),now.getMinutes(),now.getSeconds()].map(pad).join(':');
  }
  function drawNumbers() {
    const root=el('clockNumbers');root.replaceChildren();
    for(let h=1;h<=12;h++) {
      const radians=((h%12)*30-90)*Math.PI/180;
      const x=200+148*Math.cos(radians),y=200+148*Math.sin(radians);
      const group=document.createElementNS('http://www.w3.org/2000/svg','g');
      group.setAttribute('role','button');group.setAttribute('tabindex','0');group.setAttribute('aria-label',`ساعت ${clockLabel(selectedHalf===0?(h===12?0:h):(h===12?12:h+12))}`);
      const bg=document.createElementNS('http://www.w3.org/2000/svg','rect');
      bg.setAttribute('x',String(x-30));bg.setAttribute('y',String(y-26));bg.setAttribute('width','60');bg.setAttribute('height','52');bg.setAttribute('rx','12');
      bg.setAttribute('class',h===selectedNumber?'number-bg selected-hour-bg':'number-bg');
      const text=document.createElementNS('http://www.w3.org/2000/svg','text');
      text.setAttribute('x',String(x));text.setAttribute('y',String(y+2));text.setAttribute('class','hour-number');text.textContent=fa(h);
      group.append(bg,text);
      const select=()=>{selectedNumber=h;updateSelectedHour();drawNumbers();};
      group.addEventListener('click',select);
      group.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}});
      root.append(group);
    }
  }
  function updateSelectedHour() {
    el('selectedHourText').textContent=`ساعت ${selectedHourLabel()}`;
    el('formHourLabel').textContent=`برای ساعت ${selectedHourLabel()}`;
  }
  function updateDate() {
    el('dateDisplay').textContent=formatDate(chosenDay);
    el('todayBtn').textContent=chosenDay===businessKey()?'● امروز':'بازگشت به امروز';
    updateSummary();renderTasks();renderSessions();
  }
  function escapeText(s){return String(s||'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
  function renderTasks() {
    const tasks=(dayData(chosenDay).tasks||[]).slice().sort((a,b)=>Number(a.hour)-Number(b.hour));
    el('taskCount').textContent=`${fa(tasks.length)} برنامه`;
    if(!tasks.length){el('taskList').innerHTML='<p class="muted">برای این روز هنوز برنامه‌ای ثبت نشده است.</p>';return;}
    el('taskList').innerHTML=tasks.map(t=>`
      <div class="task-item ${t.done?'done':''}">
       <div class="task-main"><strong>${escapeText(t.title)}</strong><small>ساعت ${clockLabel(Number(t.hour))} · ${duration(Number(t.minutes)*60)}</small></div>
       <div class="task-actions"><button class="done-btn" data-toggle-task="${escapeText(t.id)}" type="button" aria-label="تغییر وضعیت انجام">${t.done?'↩':'✓'}</button><button data-delete-task="${escapeText(t.id)}" type="button" aria-label="حذف برنامه">×</button></div>
      </div>`).join('');
  }
  function renderSessions() {
    const sessions=(dayData(chosenDay).sessions||[]).slice().reverse();
    if(!sessions.length){el('studyHistory').innerHTML='<p class="muted">هنوز مطالعه‌ای ثبت نکرده‌ای.</p>';return;}
    el('studyHistory').innerHTML=sessions.map(s=>`<div class="session-item"><div class="task-main"><strong>${duration(Number(s.seconds)||0)}</strong><small>${s.source==='timer'?'⏱ تایمر':'✎ ثبت دستی'}</small></div><button data-delete-session="${escapeText(s.id)}" type="button" aria-label="حذف این ثبت">×</button></div>`).join('');
  }
  function updateTimer(now=Date.now()) {
    const start=state.timerStart;
    el('timerLabel').textContent=timerDuration(start?(now-start)/1000:0);
    el('timerStart').disabled=!!start;el('timerStop').disabled=!start;
  }
  function newId(){return (crypto && crypto.randomUUID) ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;}
  function refresh() {
    const newDay=businessKey();
    if(lastBusinessDay!==newDay) {
      if(viewingLive) chosenDay=newDay;
      lastBusinessDay=newDay;
      updateDate();
      notify('روز مطالعه جدید از ساعت ۲ بامداد شروع شد. برنامه‌های قبلی در آرشیو محفوظ‌اند.');
    }
    updateTimer();placeHands(new Date());
    updateSummary();
  }
  function navigateDays(count) {
    viewingLive=false;chosenDay=addDays(chosenDay,count);
    if(chosenDay===businessKey())viewingLive=true;
    updateDate();
  }
  function bindEvents() {
    el('prevDay').addEventListener('click',()=>navigateDays(-1));
    el('nextDay').addEventListener('click',()=>navigateDays(1));
    el('todayBtn').addEventListener('click',()=>{chosenDay=businessKey();viewingLive=true;updateDate();});
    el('archiveBtn').addEventListener('click',()=>{chosenDay=addDays(businessKey(),-1);viewingLive=false;updateDate();document.querySelector('.day-nav').scrollIntoView({behavior:'smooth'});});
    el('daypartToggle').addEventListener('click',()=>{selectedHalf=1-selectedHalf;updateSelectedHour();drawNumbers();});
    el('goalHours').addEventListener('change',()=>{
      const goal=Number(el('goalHours').value);
      if(!Number.isFinite(goal)||goal<.5||goal>24){notify('هدف روزانه باید بین نیم ساعت تا ۲۴ ساعت باشد.');el('goalHours').value=state.goalHours;return;}
      state.goalHours=goal;save();updateSummary();
    });
    el('taskForm').addEventListener('submit',event=>{
      event.preventDefault();const title=el('taskTitle').value.trim();const minutes=Number(el('taskMinutes').value);
      if(!title||!Number.isInteger(minutes)||minutes<1||minutes>720){notify('عنوان و مدت معتبر وارد کن (۱ تا ۷۲۰ دقیقه).');return;}
      dayData(chosenDay,true).tasks.push({id:newId(),title:title.slice(0,100),minutes,hour:hour24(),done:false});
      if(save()){el('taskTitle').value='';renderTasks();notify('برنامه ثبت شد.');}
    });
    el('taskList').addEventListener('click',event=>{
      const toggle=event.target.closest('[data-toggle-task]'),del=event.target.closest('[data-delete-task]');
      if(!toggle&&!del)return;
      const tasks=dayData(chosenDay,true).tasks;
      const id=(toggle||del).getAttribute(toggle?'data-toggle-task':'data-delete-task');
      const i=tasks.findIndex(t=>t.id===id);if(i<0)return;
      if(toggle)tasks[i].done=!tasks[i].done;
      else if(confirm('این برنامه حذف شود؟'))tasks.splice(i,1);
      else return;
      save();renderTasks();
    });
    el('timerStart').addEventListener('click',()=>{if(state.timerStart)return;state.timerStart=Date.now();save();updateTimer();notify('تایمر مطالعه شروع شد.');});
    el('timerStop').addEventListener('click',()=>{
      if(!state.timerStart)return;
      const intervals=splitInterval(state.timerStart,Date.now());
      for(const s of intervals) if(s.seconds>0)dayData(s.day,true).sessions.push({id:newId(),seconds:s.seconds,source:'timer',savedAt:Date.now()});
      state.timerStart=null;save();updateTimer();renderSessions();updateSummary();notify('زمان مطالعه ثبت شد.');
    });
    el('studyForm').addEventListener('submit',event=>{
      event.preventDefault();const mins=Number(el('manualMinutes').value);
      if(!Number.isInteger(mins)||mins<1||mins>1440){notify('مدت مطالعه باید بین ۱ تا ۱۴۴۰ دقیقه باشد.');return;}
      dayData(chosenDay,true).sessions.push({id:newId(),seconds:mins*60,source:'manual',savedAt:Date.now()});
      if(save()){el('manualMinutes').value='';renderSessions();updateSummary();notify('زمان مطالعه ذخیره شد.');}
    });
    el('studyHistory').addEventListener('click',event=>{
      const button=event.target.closest('[data-delete-session]');if(!button)return;
      if(!confirm('این زمان مطالعه حذف شود؟'))return;
      const sessions=dayData(chosenDay,true).sessions;
      const i=sessions.findIndex(s=>s.id===button.getAttribute('data-delete-session'));
      if(i>=0){sessions.splice(i,1);save();renderSessions();updateSummary();}
    });
    el('exportBtn').addEventListener('click',()=>{
      const blob=new Blob([JSON.stringify({app:'Clock Plan',exportedAt:new Date().toISOString(),data:state},null,2)],{type:'application/json;charset=utf-8'});
      const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`clock-plan-backup-${businessKey()}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
      notify('فایل پشتیبان ذخیره شد.');
    });
    el('importFile').addEventListener('change',async event=>{
      const file=event.target.files[0];if(!file)return;
      try {
        if(file.size>5*1024*1024)throw Error('حجم فایل زیاد است.');
        const obj=JSON.parse(await file.text());const data=obj.data||obj;
        if(data.version!==2 || !data.days || typeof data.days!=='object' || Array.isArray(data.days))throw Error('فایل پشتیبان Clock Plan معتبر نیست.');
        if(!confirm('بازیابی فایل جای اطلاعات فعلی را می‌گیرد. ادامه می‌دهی؟'))return;
        const clean={version:2,goalHours:Math.min(24,Math.max(.5,Number(data.goalHours)||8)),days:{},timerStart:null};
        for(const [key,day] of Object.entries(data.days)){
          if(!/^\d{4}-\d{2}-\d{2}$/.test(key)||!day||typeof day!=='object')continue;
          clean.days[key]={tasks:(Array.isArray(day.tasks)?day.tasks:[]).slice(0,10000).map(t=>({id:String(t.id||newId()),title:String(t.title||'بدون عنوان').slice(0,100),hour:Math.min(23,Math.max(0,Number(t.hour)||0)),minutes:Math.min(720,Math.max(1,Number(t.minutes)||60)),done:!!t.done})),sessions:(Array.isArray(day.sessions)?day.sessions:[]).slice(0,10000).map(s=>({id:String(s.id||newId()),seconds:Math.max(0,Math.min(86400,Number(s.seconds)||0)),source:s.source==='timer'?'timer':'manual',savedAt:Number(s.savedAt)||0}))};
        }
        state=clean;el('goalHours').value=state.goalHours;
        save();updateDate();updateTimer();notify('اطلاعات پشتیبان بازیابی شد.');
      } catch(e) {notify('خطا در بازیابی: '+e.message);}
      finally {event.target.value='';}
    });
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  }
  function initialize() {
    el('goalHours').value=state.goalHours;
    drawNumbers();updateSelectedHour();bindEvents();updateDate();refresh();
    setInterval(refresh,1000);
    if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  }
  initialize();
})();
