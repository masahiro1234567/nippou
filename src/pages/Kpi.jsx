import { useMemo, useState } from 'react';
import { ref, push, set, remove } from 'firebase/database';
import { db } from '../lib/firebase';
import { useFirebaseList } from '../lib/useFirebaseList';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import Layout from '../components/Layout';
import MonthPicker from '../components/MonthPicker';

const CHANNELS = ['エディオン','イオン','ジョーシン','ケーズデンキ','ヤマダ','コジマ','その他'];
const DOWS = ['日','月','火','水','木','金','土'];

function parseDateLocal(str) {
  if (!str) return new Date();
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function dowLabel(str) {
  return str ? DOWS[parseDateLocal(str).getDay()] + '曜' : '';
}
function todayStr() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
}
function nextDay(str) {
  const d = parseDateLocal(str);
  d.setDate(d.getDate()+1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export default function Kpi() {
  const { data: kpiData } = useFirebaseList('fp_kpi');
  const { data: kpiResults } = useFirebaseList('fp_kpi_results');
  const { data: fpUsers } = useFirebaseList('fp_users');
  const { isAdmin, user } = useAuth();
  const showToast = useToast();
  const [editing, setEditing] = useState(null);
  const [pickerVal, setPickerVal] = useState(null);
  const [channelFilter, setChannelFilter] = useState('');
  const [openIds, setOpenIds] = useState({});
  // 実績入力 state: { [kpiId_date_memberName]: actual }
  const [actuals, setActuals] = useState({});

  const registeredNames = useMemo(() =>
    new Set(Object.values(fpUsers).map(u => u.name).filter(Boolean)), [fpUsers]);

  const cards = useMemo(() => {
    return Object.entries(kpiData)
      .filter(([, k]) => {
        const cOk = !channelFilter || k.channel === channelFilter;
        const mOk = !pickerVal || (k.dates || [k.date]).some(dt => {
          if (!dt) return false;
          const d = parseDateLocal(dt);
          return d.getFullYear() === pickerVal.year && (d.getMonth()+1) === pickerVal.month;
        });
        return cOk && mOk;
      })
      .map(([id, k]) => {
        const dates = k.dates || [k.date].filter(Boolean);
        const dateMembers = k.dateMembers || {};
        return { id, k, dates, dateMembers };
      })
      .sort((a, b) => (b.dates[0]||'').localeCompare(a.dates[0]||''));
  }, [kpiData, pickerVal, channelFilter]);

  // 実績保存
  async function saveResult(kpiId, date, memberName, target, role) {
    const key = `${kpiId}_${date}_${memberName}`;
    const actual = +actuals[key] || 0;
    const ach = +target > 0 ? Math.round((actual / +target) * 100) : 0;
    await set(push(ref(db, 'fp_kpi_results')), {
      kpiId, date, memberName, target: +target || 0, actual, role, ach,
      store: kpiData[kpiId]?.store || '',
      channel: kpiData[kpiId]?.channel || '',
      updatedAt: Date.now(),
    });
    showToast('✅ 実績を保存しました');
  }

  // 既存の実績を取得
  function getResult(kpiId, date, memberName) {
    return Object.values(kpiResults).find(r =>
      r.kpiId === kpiId && r.date === date && r.memberName === memberName
    );
  }

  function openNew() {
    const d0 = todayStr();
    setEditing({ store:'', channel:'', mode:'souhan', overallTarget:'', dates:[d0],
      dateMembers:{ [d0]:[{ member:'', role:'クローザー', target:'', catcherCount:'', _custom:false }] } });
  }
  function openEdit(id) {
    const k = kpiData[id];
    setEditing({ id, store:k.store||'', channel:k.channel||'', mode:k.mode||'souhan',
      overallTarget:k.overallTarget||'', dates:k.dates||[k.date].filter(Boolean), dateMembers:k.dateMembers||{} });
  }
  function updateMember(date,idx,patch) {
    setEditing(prev=>{
      const dm={...prev.dateMembers};
      dm[date]=dm[date].map((m,i)=>i===idx?{...m,...patch}:m);
      return {...prev,dateMembers:dm};
    });
  }
  function addMember(date) {
    setEditing(prev=>{
      const dm={...prev.dateMembers};
      dm[date]=[...(dm[date]||[]),{member:'',role:'クローザー',target:'',catcherCount:'',_custom:false}];
      return {...prev,dateMembers:dm};
    });
  }
  function removeMember(date,idx) {
    setEditing(prev=>{
      const dm={...prev.dateMembers};
      dm[date]=dm[date].filter((_,i)=>i!==idx);
      return {...prev,dateMembers:dm};
    });
  }
  function addDate() {
    setEditing(prev=>{
      const last=prev.dates[prev.dates.length-1];
      const nd=nextDay(last);
      return {...prev,dates:[...prev.dates,nd],dateMembers:{...prev.dateMembers,[nd]:[{member:'',role:'クローザー',target:'',catcherCount:'',_custom:false}]}};
    });
  }
  const memberSum = useMemo(()=>{
    if(!editing) return 0;
    return editing.dates.reduce((s,dt)=>{
      const ms=editing.dateMembers[dt]||[];
      return s+ms.filter(m=>m.role!=='キャッチャー').reduce((s2,m)=>s2+(+m.target||0),0);
    },0);
  },[editing]);

  async function handleSave() {
    if(!editing.store||!editing.dates.length){showToast('店舗名・日程は必須です');return;}
    const data={
      store:editing.store, channel:editing.channel||'', mode:editing.mode,
      overallTarget:editing.overallTarget, dates:editing.dates, date:editing.dates[0],
      dateMembers:Object.fromEntries(
        Object.entries(editing.dateMembers).map(([dt,ms])=>[dt,ms.map(({_custom,...rest})=>rest)])
      ),
      updatedAt:Date.now(),
    };
    if(editing.id){await set(ref(db,`fp_kpi/${editing.id}`),data);}
    else{await set(push(ref(db,'fp_kpi')),data);}
    showToast('✅ 保存しました'); setEditing(null);
  }
  async function handleDelete(id) {
    if(!confirm('このKPIを削除しますか？')) return;
    await remove(ref(db,`fp_kpi/${id}`));
    showToast('🗑 削除しました'); setEditing(null);
  }

  return (
    <Layout title="KPI" showBack>
      <MonthPicker value={pickerVal} onChange={setPickerVal} />
      <div style={{ display:'flex', gap:8, marginBottom:10 }}>
        <select className="inp" style={{ flex:'0 0 auto', width:'auto', padding:'8px 10px', fontSize:'.84rem' }}
          value={channelFilter} onChange={e=>setChannelFilter(e.target.value)}>
          <option value="">すべての販路</option>
          {CHANNELS.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
        {isAdmin && (
          <button className="btn btn-p" style={{ flex:1 }} onClick={openNew}>＋ KPIを登録</button>
        )}
      </div>

      {cards.length===0 && <div className="empty">KPIデータなし</div>}

      {cards.map(({id,k,dates,dateMembers})=>(
        <div key={id} style={{ background:'#fff', borderRadius:'var(--r)', border:`1.5px solid ${openIds[id]?'var(--primary)':'var(--border)'}`, marginBottom:8, overflow:'hidden', boxShadow:'var(--sh-sm)' }}>
          {/* カードヘッダー */}
          <div style={{ padding:'12px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer' }}
            onClick={()=>setOpenIds(prev=>({...prev,[id]:!prev[id]}))}>
            <div>
              <div style={{ fontWeight:700, fontSize:14 }}>{k.store}</div>
              <div style={{ fontSize:11, color:'var(--sub)', marginTop:2 }}>
                {dates.map(dt=>`${dt}（${dowLabel(dt)}）`).join('・')}
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              {k.channel && <span className="badge b-orange">{k.channel}</span>}
              <span style={{ fontSize:11, color:'var(--sub)' }}>現場目標 {k.overallTarget||'−'}件</span>
              <span style={{ color:'var(--sub)', fontSize:13 }}>{openIds[id]?'▾':'›'}</span>
            </div>
          </div>

          {openIds[id] && (
            <div style={{ borderTop:'1px solid var(--border)' }}>
              {dates.map(dt=>{
                const ms=dateMembers[dt]||[];
                return (
                  <div key={dt} style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)' }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'var(--sub)', marginBottom:8 }}>{dt}（{dowLabel(dt)}）</div>
                    {ms.map((m,mi)=>{
                      const akey=`${id}_${dt}_${m.member}`;
                      const savedResult=getResult(id,dt,m.member);
                      const isCatcher=m.role==='キャッチャー';
                      const target=isCatcher?m.catcherCount:m.target;
                      const curActual=actuals[akey]??savedResult?.actual??'';
                      const pct=+target>0&&curActual!==''?Math.round((+curActual/+target)*100):null;
                      return (
                        <div key={mi} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0', borderBottom:mi<ms.length-1?'1px solid #f3f4f6':'none' }}>
                          <div>
                            <div style={{ fontSize:13, fontWeight:600, color:m.member==='他社'?'var(--sub)':'var(--text)' }}>{m.member||'−'}</div>
                            <div style={{ fontSize:11, color:'var(--sub)' }}>
                              {m.role} / 目標：{target||'−'}{isCatcher?'組':'件'}
                            </div>
                          </div>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            {m.member!=='他社' && !isCatcher && (
                              <>
                                <input
                                  type="text" inputMode="numeric"
                                  value={curActual}
                                  onChange={e=>setActuals(prev=>({...prev,[akey]:e.target.value}))}
                                  placeholder="実績"
                                  style={{ width:56, border:'1.5px solid var(--border)', borderRadius:7, padding:'5px 7px', fontSize:13, fontWeight:700, textAlign:'center' }}
                                />
                                <div style={{ minWidth:36, textAlign:'right' }}>
                                  {pct!==null
                                    ? <span style={{ fontSize:13, fontWeight:700, color:pct>=100?'var(--green)':pct>=70?'var(--orange)':'var(--red)' }}>{pct}%</span>
                                    : <span style={{ fontSize:12, color:'var(--sub)' }}>−</span>
                                  }
                                </div>
                              </>
                            )}
                            {m.member==='他社' && (
                              <input type="text" inputMode="numeric" value={actuals[akey]??''} onChange={e=>setActuals(prev=>({...prev,[akey]:e.target.value}))} placeholder="実績" style={{ width:56, border:'1.5px solid var(--border)', borderRadius:7, padding:'5px 7px', fontSize:13, textAlign:'center' }} />
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <button
                      className="btn btn-p"
                      style={{ marginTop:10, fontSize:'.82rem', padding:'9px' }}
                      onClick={async()=>{
                        for(const m of ms){
                          if(m.member&&m.member!=='他社'&&m.role!=='キャッチャー'){
                            const akey=`${id}_${dt}_${m.member}`;
                            if(actuals[akey]!==undefined){
                              await saveResult(id,dt,m.member,m.target,m.role);
                            }
                          }
                        }
                      }}
                    >
                      {dt}（{dowLabel(dt)}）の実績を保存
                    </button>
                  </div>
                );
              })}
              {isAdmin && (
                <div style={{ display:'flex', gap:8, padding:'10px 14px' }}>
                  <button className="btn btn-outline" style={{ fontSize:'.8rem', padding:'7px 12px' }} onClick={()=>openEdit(id)}>編集</button>
                  <button style={{ background:'#fee2e2', border:'none', borderRadius:8, padding:'7px 12px', color:'#dc2626', fontSize:'.8rem', fontWeight:700, cursor:'pointer' }} onClick={()=>handleDelete(id)}>削除</button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {/* 登録・編集モーダル（管理者のみ） */}
      {editing && (
        <div className="modal-overlay" onClick={()=>setEditing(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <h3 style={{marginBottom:10}}>{editing.id?'KPIを編集':'KPIを登録'}</h3>
            <div className="form-group">
              <label>店舗名 <span className="req">*</span></label>
              <input className="inp" value={editing.store} onChange={e=>setEditing({...editing,store:e.target.value})} />
            </div>
            <div className="form-group">
              <label>販路</label>
              <select className="inp" value={editing.channel||''} onChange={e=>setEditing({...editing,channel:e.target.value})}>
                <option value="">選択</option>
                {CHANNELS.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* カウント方式・現場全体目標 */}
            <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',gap:10,marginBottom:10,flexWrap:'wrap'}}>
              <div>
                <div style={{fontSize:'.7rem',color:'var(--sub)',marginBottom:4}}>カウント方式</div>
                <div onClick={()=>setEditing({...editing,mode:editing.mode==='souhan'?'riku':'souhan'})}
                  style={{display:'flex',border:'1.5px solid var(--border)',borderRadius:8,overflow:'hidden',width:128,cursor:'pointer'}}>
                  <div style={{width:64,textAlign:'center',padding:'6px 0',fontSize:'.72rem',fontWeight:700,background:editing.mode==='souhan'?'var(--primary)':'#fff',color:editing.mode==='souhan'?'#fff':'var(--sub)'}}>総販</div>
                  <div style={{width:64,textAlign:'center',padding:'6px 0',fontSize:'.72rem',fontWeight:700,background:editing.mode==='riku'?'var(--primary)':'#fff',color:editing.mode==='riku'?'#fff':'var(--sub)'}}>リク抜き</div>
                </div>
              </div>
              <div style={{flex:'0 0 100px'}}>
                <div style={{fontSize:'.7rem',color:'var(--sub)',marginBottom:4}}>現場全体の目標</div>
                <input className="inp" style={{width:'100%',boxSizing:'border-box',textAlign:'right'}} type="text" inputMode="numeric" placeholder="0"
                  value={editing.overallTarget} onChange={e=>setEditing({...editing,overallTarget:e.target.value})} />
              </div>
            </div>

            {editing.dates.map((dt)=>(
              <div key={dt} style={{background:'#f9fafb',borderRadius:10,padding:12,marginBottom:10}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                  <input className="inp" type="date" value={dt} onChange={e=>{
                    const newDates=editing.dates.map(d=>d===dt?e.target.value:d);
                    const newDm={...editing.dateMembers};
                    newDm[e.target.value]=newDm[dt]||[];
                    delete newDm[dt];
                    setEditing({...editing,dates:newDates,dateMembers:newDm});
                  }} style={{flex:1,padding:'6px 10px',fontSize:'.84rem'}} />
                  <span style={{fontSize:'.8rem',color:'var(--sub)'}}>{dowLabel(dt)}</span>
                </div>
                {(editing.dateMembers[dt]||[]).map((m,mi)=>(
                  <div key={mi} style={{marginBottom:8}}>
                    <div style={{display:'flex',gap:4,alignItems:'center',marginBottom:4}}>
                      {m.member==='他社'?(
                        <div style={{flex:2,background:'#f1f5f9',border:'1.5px solid var(--border)',borderRadius:8,padding:'8px 10px',fontSize:'.84rem',color:'var(--sub)',fontWeight:600}}>他社</div>
                      ):m._custom?(
                        <input className="inp" style={{flex:2}} placeholder="名前を入力" value={m.member} onChange={e=>updateMember(dt,mi,{member:e.target.value})} />
                      ):(
                        <select className="inp" style={{flex:2}} value={m.member} onChange={e=>{
                          if(e.target.value==='__new__'){updateMember(dt,mi,{member:'',_custom:true});}
                          else{updateMember(dt,mi,{member:e.target.value,_custom:false});}
                        }}>
                          <option value="">メンバーを選択</option>
                          {[...registeredNames].sort().map(n=><option key={n} value={n}>{n}</option>)}
                          <option value="__new__">＋ 新規入力...</option>
                        </select>
                      )}
                      <select className="inp" style={{flex:1}} value={m.role} onChange={e=>updateMember(dt,mi,{role:e.target.value})}>
                        <option value="クローザー">クローザー</option>
                        <option value="ディレクター">ディレクター</option>
                        <option value="キャッチャー">キャッチャー</option>
                      </select>
                      {m.role==='キャッチャー'?(
                        <input className="inp" style={{flex:'0 0 56px'}} type="text" inputMode="numeric" placeholder="0" value={m.catcherCount} onChange={e=>updateMember(dt,mi,{catcherCount:e.target.value})} />
                      ):(
                        <input className="inp" style={{flex:'0 0 56px'}} type="text" inputMode="numeric" placeholder="0" value={m.target} onChange={e=>updateMember(dt,mi,{target:e.target.value})} />
                      )}
                      {mi>0&&<button onClick={()=>removeMember(dt,mi)} style={{background:'#fee2e2',border:'none',borderRadius:6,padding:'6px 8px',color:'#dc2626',cursor:'pointer'}}>×</button>}
                    </div>
                    {m._custom&&m.member!=='他社'&&(
                      <button onClick={()=>updateMember(dt,mi,{member:'',_custom:false})} style={{background:'none',border:'none',color:'var(--sub)',fontSize:'.7rem',cursor:'pointer',padding:0}}>← リストから選ぶ</button>
                    )}
                  </div>
                ))}
                <div style={{display:'flex',gap:8,marginTop:6}}>
                  <button className="btn btn-gray" style={{flex:1,padding:'8px 10px',fontSize:'.82rem'}} onClick={()=>addMember(dt)}>＋ メンバーを追加</button>
                  <button style={{flexShrink:0,background:'#f1f5f9',color:'var(--sub)',border:'1.5px solid var(--border)',borderRadius:8,padding:'8px 14px',fontSize:'.82rem',fontWeight:700,cursor:'pointer'}}
                    onClick={()=>{setEditing(prev=>{const dm={...prev.dateMembers};dm[dt]=[...(dm[dt]||[]),{member:'他社',role:'クローザー',target:'',catcherCount:'',_custom:false}];return {...prev,dateMembers:dm};});}}>
                    他社
                  </button>
                </div>
              </div>
            ))}
            <button className="btn btn-gray" style={{marginBottom:10}} onClick={addDate}>＋ 日程を追加</button>
            <div style={{background:'#f9fafb',borderRadius:8,padding:'8px 12px',fontSize:'.78rem',marginBottom:10,display:'flex',justifyContent:'space-between'}}>
              <span>メンバー目標の合計：<strong>{memberSum}件</strong></span>
              <span style={{color:memberSum===+(editing.overallTarget||0)?'var(--green)':'var(--red)'}}>
                現場全体の目標：{editing.overallTarget||0}件（{memberSum===+(editing.overallTarget||0)?'一致':'不一致'}）
              </span>
            </div>
            <button className="btn btn-p" onClick={handleSave}>保存</button>
            {editing.id&&<button className="btn" style={{background:'#fee2e2',color:'#dc2626'}} onClick={()=>handleDelete(editing.id)}>🗑 削除</button>}
            <button className="btn btn-gray" onClick={()=>setEditing(null)}>キャンセル</button>
          </div>
        </div>
      )}
    </Layout>
  );
}
