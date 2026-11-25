/**
 * Zakovat Bot — Cloudflare Worker webhook starter
 * Telegram webhook updates -> Worker -> Telegram Bot API.
 */
const MENU = { keyboard: [[{text:"▶ Читать"}],[{text:"📦 Пакеты"},{text:"❓ Помощь"}]], resize_keyboard:true };
const esc = s => String(s ?? "").replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
async function tg(env, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(body)
  });
  const j=await r.json(); if(!j.ok) console.error("Telegram API error",j); return j;
}
async function send(env, chat, text, extra={}) { return tg(env,"sendMessage",{chat_id:chat,text,parse_mode:"HTML",...extra}); }
function allowed(update, env) {
  return (update.message?.chat?.type==="private" && String(update.message.from?.id)===String(env.OWNER_ID)) ||
    (update.callback_query?.message?.chat?.type==="private" && String(update.callback_query.from?.id)===String(env.OWNER_ID));
}
async function handle(update, env) {
  if(!allowed(update,env)) return;
  const m=update.message, c=update.callback_query;
  const chat=m?.chat?.id ?? c?.message?.chat?.id;
  const udkey=`user:${String(env.OWNER_ID)}:state`;
  let state=await env.STATE.get(udkey,"json") || {selected:[],index:0};
  if(c) {
    await tg(env,"answerCallbackQuery",{callback_query_id:c.id});
    if(c.data==="qnext"){state.index++;await env.STATE.put(udkey,JSON.stringify(state));return quiz(env,chat,state);}
    if(c.data==="qanswer"){return answer(env,chat,state);}
    if(c.data==="qstop"){return send(env,chat,"Чтение приостановлено.",{reply_markup:MENU});}
    if(c.data?.startsWith("pack:")) {
      state.selected=[c.data.slice(5)];state.index=0;
      await env.STATE.put(udkey,JSON.stringify(state));
      return send(env,chat,"Пакет выбран. Нажмите «▶ Читать».",{reply_markup:MENU});
    }
    return;
  }
  const text=m?.text||"";
  if(text==="/start"||text==="/help"||text==="❓ Помощь") {
    return send(env,chat,"<b>Zakovat Bot (Cloudflare)</b>\n\nПеренос начат. Эта версия пока поддерживает базовые команды и чтение пакетов JSON.\n\n/packs — список пакетов\n/read — начать чтение\n/help — помощь",{reply_markup:MENU});
  }
  if(text==="/packs"||text==="📦 Пакеты") {
    const keys=await env.PACKS.list({prefix:"pack:"});
    if(!keys.keys.length) return send(env,chat,"Пакетов пока нет в хранилище Worker.");
    const rows=[];
    for(const k of keys.keys){const p=await env.PACKS.get(k.name,"json");rows.push([{text:`${p?.name||k.name}`,callback_data:`pack:${k.name.slice(5)}`}]);}
    return send(env,chat,"Выберите пакет:",{reply_markup:{inline_keyboard:rows}});
  }
  if(text==="/read"||text==="▶ Читать") {state.index=0;await env.STATE.put(udkey,JSON.stringify(state));return quiz(env,chat,state);}
  if(text.startsWith("/go ")) {const n=parseInt(text.slice(4),10);if(Number.isFinite(n)){state.index=Math.max(0,n-1);await env.STATE.put(udkey,JSON.stringify(state));return quiz(env,chat,state);} }
  return send(env,chat,"Используйте /packs для выбора пакета или /read.",{reply_markup:MENU});
}
async function quiz(env,chat,state){
  if(!state.selected?.length) return send(env,chat,"Сначала выберите пакет через /packs.",{reply_markup:MENU});
  const pack=await env.PACKS.get(`pack:${state.selected[0]}`,"json");
  if(!pack?.questions?.length)return send(env,chat,"Пакет не найден или пуст.");
  if(state.index>=pack.questions.length){state.index=0;await env.STATE.put(`user:${env.OWNER_ID}:state`,JSON.stringify(state));return send(env,chat,"🏁 Последний вопрос. /read — начать заново.");}
  const q=pack.questions[state.index],parts=q.parts||[];
  let out=`<i>${state.index+1}/${pack.questions.length}</i>\n<b>${esc(`${q.number}-savol`+(q.title?` · ${q.title}`:""))}</b>\n`;
  for(const p of parts)out+=`\n${esc(p.text||"")}`;
  return send(env,chat,out,{reply_markup:{inline_keyboard:[[{text:"👁 Ответ",callback_data:"qanswer"},{text:"⏭ Далее",callback_data:"qnext"}],[{text:"⏹ Пауза",callback_data:"qstop"}]]}});
}
async function answer(env,chat,state){
  if(!state.selected?.length)return send(env,chat,"Пакет не выбран.");
  const pack=await env.PACKS.get(`pack:${state.selected[0]}`,"json"),q=pack?.questions?.[state.index];
  if(!q)return send(env,chat,"Вопрос не найден.");
  let out="";for(const p of q.parts||[])out+=`✅ <b>Javob:</b> ${esc(p.answer||"—")}\n${p.accept?`☑️ <b>Zachot:</b> ${esc(p.accept)}\n`:""}${p.comment?`💬 <b>Izoh:</b> ${esc(p.comment)}\n`:""}${p.source?`🔗 ${esc(p.source)}\n`:""}`;
  return send(env,chat,out,{reply_markup:{inline_keyboard:[[{text:"➡ Дальше",callback_data:"qnext"}],[{text:"⏹ Пауза",callback_data:"qstop"}]]}});
}
export default {
 async fetch(request,env){
   if(request.method==="GET")return new Response("Zakovat Worker alive",{status:200});
   if(request.method!=="POST")return new Response("Method Not Allowed",{status:405});
   const secret=request.headers.get("X-Telegram-Bot-Api-Secret-Token");
   if(env.WEBHOOK_SECRET && secret!==env.WEBHOOK_SECRET)return new Response("Unauthorized",{status:401});
   let update;try{update=await request.json();}catch{return new Response("Bad JSON",{status:400});}
   try{await handle(update,env);}catch(e){console.error(e);}
   return new Response("ok");
 }
};
