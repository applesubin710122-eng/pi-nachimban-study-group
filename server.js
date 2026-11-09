import express from 'express';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename=fileURLToPath(import.meta.url), __dirname=path.dirname(__filename);
const app=express();
app.use(express.json({limit:'2mb'}));
app.use(express.urlencoded({extended:true}));
const {Pool}=pg;
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL?{rejectUnauthorized:false}:false});
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024}});

async function q(sql,params=[]){return (await pool.query(sql,params)).rows}
function today(){return new Date().toISOString().slice(0,10)}
function weekKey(d=today()){const x=new Date(d+'T00:00:00Z'); const day=x.getUTCDay(); x.setUTCDate(x.getUTCDate()+(4-day)); const y=x.getUTCFullYear(); const one=new Date(Date.UTC(y,0,1)); return `${y}-W${String(Math.ceil((((x-one)/86400000)+one.getUTCDay()+1)/7)).padStart(2,'0')}`}
async function init(){
 await q(`CREATE TABLE IF NOT EXISTS users(
 id TEXT PRIMARY KEY,pw_hash TEXT NOT NULL,name TEXT NOT NULL,tags JSONB NOT NULL DEFAULT '[]',roles JSONB NOT NULL DEFAULT '[]',pi INTEGER NOT NULL DEFAULT 0,missions INTEGER NOT NULL DEFAULT 0,dayoff_coupons INTEGER NOT NULL DEFAULT 0,active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ DEFAULT now());
 CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY,v TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS role_permissions(role TEXT PRIMARY KEY,permissions JSONB NOT NULL DEFAULT '[]');
 CREATE TABLE IF NOT EXISTS subjects(id SERIAL PRIMARY KEY,name TEXT UNIQUE NOT NULL,active BOOLEAN NOT NULL DEFAULT TRUE);
 CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY,name TEXT NOT NULL,price INTEGER NOT NULL,stock INTEGER NOT NULL,kind TEXT NOT NULL DEFAULT '일반 상품',active BOOLEAN NOT NULL DEFAULT TRUE);
 CREATE TABLE IF NOT EXISTS missions(id SERIAL PRIMARY KEY,kind TEXT NOT NULL,mission_date DATE NOT NULL,week_key TEXT,content TEXT NOT NULL,UNIQUE(kind,mission_date),UNIQUE(kind,week_key));
 CREATE TABLE IF NOT EXISTS mission_certs(id SERIAL PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,mission_id INTEGER NOT NULL REFERENCES missions(id) ON DELETE CASCADE,status TEXT NOT NULL DEFAULT 'pending',photo_data BYTEA,photo_type TEXT,created_at TIMESTAMPTZ DEFAULT now());
 CREATE TABLE IF NOT EXISTS notices(id SERIAL PRIMARY KEY,title TEXT NOT NULL,content TEXT NOT NULL,created_at TIMESTAMPTZ DEFAULT now());
 CREATE TABLE IF NOT EXISTS courses(id TEXT PRIMARY KEY,name TEXT NOT NULL,capacity INTEGER NOT NULL,open BOOLEAN DEFAULT TRUE,created_at TIMESTAMPTZ DEFAULT now());
 CREATE TABLE IF NOT EXISTS course_applications(id SERIAL PRIMARY KEY,course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,instagram TEXT,message TEXT,status TEXT NOT NULL DEFAULT 'pending',created_at TIMESTAMPTZ DEFAULT now());
 CREATE TABLE IF NOT EXISTS mentor_subjects(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,active BOOLEAN DEFAULT TRUE,PRIMARY KEY(user_id,subject_id));
 CREATE TABLE IF NOT EXISTS questions(id SERIAL PRIMARY KEY,subject_id INTEGER REFERENCES subjects(id),grade TEXT NOT NULL,content TEXT NOT NULL,photo_data BYTEA,photo_type TEXT,created_by TEXT NOT NULL REFERENCES users(id),status TEXT NOT NULL DEFAULT 'waiting',created_at TIMESTAMPTZ DEFAULT now());
 CREATE TABLE IF NOT EXISTS question_answers(id SERIAL PRIMARY KEY,question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,content TEXT NOT NULL,created_at TIMESTAMPTZ DEFAULT now());
 CREATE TABLE IF NOT EXISTS warnings(id SERIAL PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at TIMESTAMPTZ DEFAULT now());
 CREATE TABLE IF NOT EXISTS mission_types(id SERIAL PRIMARY KEY,name TEXT UNIQUE NOT NULL,required BOOLEAN NOT NULL DEFAULT TRUE,active BOOLEAN NOT NULL DEFAULT TRUE);
 CREATE TABLE IF NOT EXISTS mission_submissions(id SERIAL PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,mission_type_id INTEGER NOT NULL REFERENCES mission_types(id) ON DELETE CASCADE,mission_date DATE NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at TIMESTAMPTZ DEFAULT now(),UNIQUE(user_id,mission_type_id,mission_date));`);
 const exists=await q('SELECT id FROM users WHERE id=$1',['study_47_10']);
 if(!exists.length) await q('INSERT INTO users(id,pw_hash,name,tags,roles,pi) VALUES($1,$2,$3,$4,$5,$6)', ['study_47_10',await bcrypt.hash('123456',10),'설연',JSON.stringify(['대표','고1']),JSON.stringify(['대표','관리자']),2850]);
 for(const [k,v] of [['minutePi','10'],['dayOffCouponPrice','500'],['dayOffPerWeek','1']]) await q('INSERT INTO settings(k,v) VALUES($1,$2) ON CONFLICT(k) DO NOTHING',[k,v]);
 for(const s of ['국어','영어','수학','과학','사회','화학Ⅰ','생명과학Ⅰ']) await q('INSERT INTO subjects(name) VALUES($1) ON CONFLICT(name) DO NOTHING',[s]);
 for(const [n,r] of [['공부인증',true],['문제 만들기',true],['멘토·멘티 활동하기',true],['공부 시간 인증하기',false]]) await q('INSERT INTO mission_types(name,required) VALUES($1,$2) ON CONFLICT(name) DO NOTHING',[n,r]);
 const defaults={대표:['manage_users','manage_roles','manage_subjects','manage_products','manage_missions','manage_courses','manage_notices','review_applications','review_warnings','download_certs'],관리자:['manage_subjects','manage_products','manage_missions','manage_courses','manage_notices','review_applications','review_warnings'],부대표:['review_questions','review_applications'],공동대표:['manage_users','manage_roles','manage_subjects','manage_products','manage_missions','manage_courses','manage_notices','review_applications','review_warnings','download_certs'],멘토:['answer_questions','view_assigned_questions'],멘티:[]};
 for(const [r,p] of Object.entries(defaults)) await q('INSERT INTO role_permissions(role,permissions) VALUES($1,$2) ON CONFLICT(role) DO NOTHING',[r,JSON.stringify(p)]);
}
async function user(req){const id=req.headers['x-user-id']; if(!id)return null; return (await q('SELECT id,name,tags,roles,pi,missions,dayoff_coupons,active FROM users WHERE id=$1',[id]))[0]||null}
function requireLogin(fn){return async(req,res,next)=>{const u=await user(req);if(!u||!u.active)return res.status(401).json({error:'로그인이 필요합니다.'});req.user=u;fn(req,res,next)}}
async function can(u,perm){if(u.roles.includes('대표'))return true; const rows=await q('SELECT permissions FROM role_permissions WHERE role=ANY($1)',[u.roles]);return rows.some(r=>(r.permissions||[]).includes(perm))}
function admin(req,res,next){can(req.user,'manage_users').then(ok=>ok?next():res.status(403).json({error:'권한이 없습니다.'})).catch(next)}

app.get('/api/health',async(_,res)=>res.json({ok:true,time:new Date().toISOString()}));
app.post('/api/login',async(req,res)=>{const {id,pw}=req.body;const r=await q('SELECT * FROM users WHERE id=$1',[id]);if(!r.length||!r[0].active||!(await bcrypt.compare(pw||'',r[0].pw_hash)))return res.status(401).json({error:'아이디 또는 비밀번호가 맞지 않습니다.'});res.json({id:r[0].id,name:r[0].name,tags:r[0].tags,roles:r[0].roles,pi:r[0].pi,missions:r[0].missions,dayoff_coupons:r[0].dayoff_coupons});});
app.get('/api/me',requireLogin,(req,res)=>res.json(req.user));
app.patch('/api/me/password',requireLogin,async(req,res)=>{if(!req.body.newPassword||req.body.newPassword.length<4)return res.status(400).json({error:'비밀번호는 4자 이상이어야 합니다.'});await q('UPDATE users SET pw_hash=$1 WHERE id=$2',[await bcrypt.hash(req.body.newPassword,10),req.user.id]);res.json({ok:true});});

app.get('/api/settings',async(_,res)=>{const rows=await q('SELECT k,v FROM settings');const out={};rows.forEach(x=>out[x.k]=Number.isNaN(Number(x.v))?x.v:Number(x.v));res.json(out)});
app.patch('/api/settings',requireLogin,admin,async(req,res)=>{for(const [k,v] of Object.entries(req.body||{}))await q('INSERT INTO settings(k,v) VALUES($1,$2) ON CONFLICT(k) DO UPDATE SET v=EXCLUDED.v',[k,String(v)]);res.json({ok:true});});
app.get('/api/roles',requireLogin,async(_,res)=>res.json(await q('SELECT role,permissions FROM role_permissions ORDER BY role')));
app.patch('/api/roles/:role',requireLogin,admin,async(req,res)=>{await q('INSERT INTO role_permissions(role,permissions) VALUES($1,$2) ON CONFLICT(role) DO UPDATE SET permissions=EXCLUDED.permissions',[req.params.role,JSON.stringify(req.body.permissions||[])]);res.json({ok:true});});

app.get('/api/users',requireLogin,admin,async(_,res)=>res.json(await q('SELECT id,name,tags,roles,pi,missions,dayoff_coupons,active,created_at FROM users ORDER BY created_at')));
app.post('/api/users',requireLogin,admin,async(req,res)=>{const {id,name,password='1234',tags=[],roles=['멘티']}=req.body;if(!id||!name)return res.status(400).json({error:'아이디와 이름을 입력하세요.'});try{res.json((await q('INSERT INTO users(id,pw_hash,name,tags,roles) VALUES($1,$2,$3,$4,$5) RETURNING id,name,tags,roles,pi,missions,dayoff_coupons,active',[id,await bcrypt.hash(password,10),name,JSON.stringify(tags),JSON.stringify(roles)]))[0])}catch(e){res.status(400).json({error:'이미 존재하는 아이디입니다.'})}});
app.patch('/api/users/:id',requireLogin,admin,async(req,res)=>{const fields=[];const vals=[];let i=1;for(const k of ['name','active','pi'])if(req.body[k]!==undefined){fields.push(`${k}=$${i++}`);vals.push(req.body[k])}if(req.body.tags) {fields.push(`tags=$${i++}`);vals.push(JSON.stringify(req.body.tags))}if(req.body.roles){fields.push(`roles=$${i++}`);vals.push(JSON.stringify(req.body.roles))}if(req.body.password){fields.push(`pw_hash=$${i++}`);vals.push(await bcrypt.hash(req.body.password,10))}if(!fields.length)return res.json({ok:true});vals.push(req.params.id);await q(`UPDATE users SET ${fields.join(',')} WHERE id=$${i}`,vals);res.json({ok:true});});
app.delete('/api/users/:id',requireLogin,admin,async(req,res)=>{if(req.params.id==='study_47_10')return res.status(400).json({error:'대표 계정은 삭제할 수 없습니다.'});await q('DELETE FROM users WHERE id=$1',[req.params.id]);res.json({ok:true});});

app.get('/api/subjects',async(_,res)=>res.json(await q('SELECT id,name,active FROM subjects ORDER BY id')));
app.post('/api/subjects',requireLogin,admin,async(req,res)=>res.json((await q('INSERT INTO subjects(name) VALUES($1) RETURNING *',[req.body.name]))[0]));
app.patch('/api/subjects/:id',requireLogin,admin,async(req,res)=>res.json((await q('UPDATE subjects SET name=$1,active=$2 WHERE id=$3 RETURNING *',[req.body.name,req.body.active!==false,req.params.id]))[0]));
app.delete('/api/subjects/:id',requireLogin,admin,async(req,res)=>{await q('DELETE FROM subjects WHERE id=$1',[req.params.id]);res.json({ok:true})});
app.get('/api/mentors',requireLogin,async(_,res)=>res.json(await q(`SELECT u.id,u.name,u.active,u.roles,COALESCE(json_agg(json_build_object('id',s.id,'name',s.name)) FILTER(WHERE s.id IS NOT NULL),'[]') subjects FROM users u LEFT JOIN mentor_subjects ms ON ms.user_id=u.id AND ms.active=true LEFT JOIN subjects s ON s.id=ms.subject_id WHERE u.roles ? '멘토' GROUP BY u.id ORDER BY u.name`)));
app.put('/api/mentors/:id/subjects',requireLogin,admin,async(req,res)=>{await q('DELETE FROM mentor_subjects WHERE user_id=$1',[req.params.id]);for(const sid of req.body.subjectIds||[])await q('INSERT INTO mentor_subjects(user_id,subject_id) VALUES($1,$2)',[req.params.id,sid]);res.json({ok:true})});

app.get('/api/products',async(_,res)=>res.json(await q('SELECT id,name,price,stock,kind,active FROM products WHERE active=true ORDER BY name')));
app.post('/api/products',requireLogin,admin,async(req,res)=>{const id='p_'+Date.now();res.json((await q('INSERT INTO products(id,name,price,stock,kind) VALUES($1,$2,$3,$4,$5) RETURNING *',[id,req.body.name,Number(req.body.price),Number(req.body.stock),req.body.kind||'일반 상품']))[0])});
app.patch('/api/products/:id',requireLogin,admin,async(req,res)=>res.json((await q('UPDATE products SET name=$1,price=$2,stock=$3,kind=$4,active=$5 WHERE id=$6 RETURNING *',[req.body.name,Number(req.body.price),Number(req.body.stock),req.body.kind||'일반 상품',req.body.active!==false,req.params.id]))[0]));
app.delete('/api/products/:id',requireLogin,admin,async(req,res)=>{await q('UPDATE products SET active=false WHERE id=$1',[req.params.id]);res.json({ok:true})});
app.post('/api/products/:id/buy',requireLogin,async(req,res)=>{const client=await pool.connect();try{await client.query('BEGIN');const p=(await client.query('SELECT * FROM products WHERE id=$1 AND active=true FOR UPDATE',[req.params.id])).rows[0];const u=(await client.query('SELECT pi FROM users WHERE id=$1 FOR UPDATE',[req.user.id])).rows[0];if(!p)return res.status(404).json({error:'상품이 없습니다.'});if(p.stock===0)return res.status(400).json({error:'품절입니다.'});if(u.pi<p.price)return res.status(400).json({error:'π가 부족합니다.'});await client.query('UPDATE users SET pi=pi-$1 WHERE id=$2',[p.price,req.user.id]);if(p.stock>0)await client.query('UPDATE products SET stock=stock-1 WHERE id=$1',[p.id]);await client.query('COMMIT');res.json({ok:true})}catch(e){await client.query('ROLLBACK');res.status(500).json({error:'구매 처리에 실패했습니다.'})}finally{client.release()}});
app.post('/api/dayoff/buy',requireLogin,async(req,res)=>{const price=Number((await q("SELECT v FROM settings WHERE k='dayOffCouponPrice'"))[0]?.v||500);const u=(await q('SELECT pi FROM users WHERE id=$1',[req.user.id]))[0];if(u.pi<price)return res.status(400).json({error:'π가 부족합니다.'});await q('UPDATE users SET pi=pi-$1,dayoff_coupons=dayoff_coupons+1 WHERE id=$2',[price,req.user.id]);res.json({ok:true})});
app.post('/api/dayoff/use',requireLogin,async(req,res)=>{const u=(await q('SELECT dayoff_coupons FROM users WHERE id=$1',[req.user.id]))[0];if(!u.dayoff_coupons)return res.status(400).json({error:'데이 오프 쿠폰이 없습니다.'});await q('UPDATE users SET dayoff_coupons=dayoff_coupons-1 WHERE id=$1',[req.user.id]);res.json({ok:true})});

const dailyPool=['오늘 공부한 내용 중 가장 기억에 남는 개념을 한 문장으로 정리하기!','오늘 푼 문제 중 가장 어려웠던 문제와 해결 과정을 기록하기!','틀린 문제 하나를 다시 풀고 왜 틀렸는지 적어보기!','교과서에서 새롭게 알게 된 개념 하나를 골라 설명하기!','오늘 공부한 내용을 친구에게 설명한다고 생각하고 3문장으로 정리하기!'];
const weeklyPool=['이번 주 오답 5개를 골라 원인과 풀이를 정리하기!','어려웠던 단원을 선택해 복습 노트를 만들기!','이번 주 공부 목표와 달성률을 기록하고 다음 주 계획 세우기!','이번 주 가장 부족했던 과목을 골라 보충 학습 계획 세우기!'];
app.get('/api/missions',async(req,res)=>{const d=req.query.date||today();const wk=weekKey(d);let daily=(await q('SELECT * FROM missions WHERE kind=$1 AND mission_date=$2',['daily',d]))[0];let weekly=(await q('SELECT * FROM missions WHERE kind=$1 AND week_key=$2',['weekly',wk]))[0];if(!daily){const content=dailyPool[(new Date(d).getUTCDate()+new Date(d).getUTCMonth())%dailyPool.length];daily=(await q('INSERT INTO missions(kind,mission_date,content) VALUES($1,$2,$3) RETURNING *',['daily',d,content]))[0]}if(!weekly){const content=weeklyPool[(new Date(d).getUTCWeek?.()||new Date(d).getUTCDate()+new Date(d).getUTCMonth())%weeklyPool.length];weekly=(await q('INSERT INTO missions(kind,mission_date,week_key,content) VALUES($1,$2,$3,$4) RETURNING *',['weekly',d,wk,content]))[0]}res.json({daily,weekly})});
app.patch('/api/missions/:id',requireLogin,admin,async(req,res)=>res.json((await q('UPDATE missions SET content=$1 WHERE id=$2 RETURNING *',[req.body.content,req.params.id]))[0]));
app.get('/api/mission-types',async(_,res)=>res.json(await q('SELECT * FROM mission_types WHERE active=true ORDER BY required DESC,id')));
app.post('/api/mission-types',requireLogin,admin,async(req,res)=>res.json((await q('INSERT INTO mission_types(name,required) VALUES($1,$2) RETURNING *',[req.body.name,!!req.body.required]))[0]));
app.patch('/api/mission-types/:id',requireLogin,admin,async(req,res)=>res.json((await q('UPDATE mission_types SET name=$1,required=$2,active=$3 WHERE id=$4 RETURNING *',[req.body.name,!!req.body.required,req.body.active!==false,req.params.id]))[0]));
app.post('/api/mission-submissions',requireLogin,upload.single('photo'),async(req,res)=>{const d=req.body.date||today();const mt=Number(req.body.missionTypeId);const r=await q('INSERT INTO mission_submissions(user_id,mission_type_id,mission_date) VALUES($1,$2,$3) ON CONFLICT(user_id,mission_type_id,mission_date) DO UPDATE SET status=\'pending\',created_at=now() RETURNING *',[req.user.id,mt,d]);res.json(r[0])});
app.get('/api/my-submissions',requireLogin,async(req,res)=>res.json(await q(`SELECT ms.*,mt.name,mt.required FROM mission_submissions ms JOIN mission_types mt ON mt.id=ms.mission_type_id WHERE ms.user_id=$1 AND ms.mission_date=$2 ORDER BY mt.id`,[req.user.id,req.query.date||today()])));
app.get('/api/certifications',requireLogin,admin,async(_,res)=>res.json(await q(`SELECT mc.id,mc.user_id,u.name,mc.status,mc.created_at,mc.photo_type FROM mission_certs mc JOIN users u ON u.id=mc.user_id ORDER BY mc.created_at DESC`)));
app.delete('/api/certifications/:id',requireLogin,admin,async(req,res)=>{await q('DELETE FROM mission_certs WHERE id=$1',[req.params.id]);res.json({ok:true})});

app.get('/api/notices',async(_,res)=>res.json(await q('SELECT id,title,content,created_at FROM notices ORDER BY created_at DESC')));
app.post('/api/notices',requireLogin,admin,async(req,res)=>res.json((await q('INSERT INTO notices(title,content) VALUES($1,$2) RETURNING *',[req.body.title,req.body.content]))[0]));
app.delete('/api/notices/:id',requireLogin,admin,async(req,res)=>{await q('DELETE FROM notices WHERE id=$1',[req.params.id]);res.json({ok:true})});

app.get('/api/courses',async(_,res)=>res.json(await q('SELECT * FROM courses ORDER BY created_at DESC')));
app.post('/api/courses',requireLogin,admin,async(req,res)=>res.json((await q('INSERT INTO courses(id,name,capacity) VALUES($1,$2,$3) RETURNING *',['c_'+Date.now(),req.body.name,Number(req.body.capacity)]))[0]));
app.patch('/api/courses/:id',requireLogin,admin,async(req,res)=>res.json((await q('UPDATE courses SET open=$1 WHERE id=$2 RETURNING *',[!!req.body.open,req.params.id]))[0]));
app.post('/api/courses/:id/apply',requireLogin,async(req,res)=>res.json((await q('INSERT INTO course_applications(course_id,user_id,name,instagram,message) VALUES($1,$2,$3,$4,$5) RETURNING *',[req.params.id,req.user.id,req.body.name||req.user.name,req.body.instagram||'',req.body.message||'']))[0]));
app.get('/api/applications',requireLogin,admin,async(_,res)=>res.json(await q(`SELECT ca.*,c.name course_name FROM course_applications ca JOIN courses c ON c.id=ca.course_id ORDER BY ca.created_at DESC`)));
app.patch('/api/applications/:id',requireLogin,admin,async(req,res)=>res.json((await q('UPDATE course_applications SET status=$1 WHERE id=$2 RETURNING *',[req.body.status,req.params.id]))[0]));

app.get('/api/questions',requireLogin,async(req,res)=>{const rows=await q(`SELECT q.id,q.subject_id,q.grade,q.content,q.status,q.created_by,q.created_at,s.name subject,u.name creator FROM questions q LEFT JOIN subjects s ON s.id=q.subject_id JOIN users u ON u.id=q.created_by ORDER BY q.created_at DESC`);for(const r of rows)r.answers=await q(`SELECT qa.id,qa.content,qa.created_at,qa.user_id,u.name FROM question_answers qa JOIN users u ON u.id=qa.user_id WHERE qa.question_id=$1 ORDER BY qa.created_at`,[r.id]);res.json(rows)});
app.post('/api/questions',requireLogin,upload.single('photo'),async(req,res)=>{const f=req.file;res.json((await q('INSERT INTO questions(subject_id,grade,content,photo_data,photo_type,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,subject_id,grade,content,status,created_by,created_at',[Number(req.body.subjectId),req.body.grade,req.body.content,f?f.buffer:null,f?.mimetype||null,req.user.id]))[0]);});
app.post('/api/questions/:id/answers',requireLogin,async(req,res)=>{if(!(await can(req.user,'answer_questions')))return res.status(403).json({error:'멘토/대표/부대표만 답변할 수 있습니다.'});await q('UPDATE questions SET status=$1 WHERE id=$2',['answered',req.params.id]);res.json((await q('INSERT INTO question_answers(question_id,user_id,content) VALUES($1,$2,$3) RETURNING *',[req.params.id,req.user.id,req.body.content]))[0]);});
app.get('/api/questions/:id/photo',requireLogin,async(req,res)=>{const r=(await q('SELECT photo_data,photo_type,created_by FROM questions WHERE id=$1',[req.params.id]))[0];if(!r?.photo_data)return res.sendStatus(404);res.set('Content-Type',r.photo_type||'image/jpeg');res.send(r.photo_data)});

app.get('/api/warnings',requireLogin,async(req,res)=>res.json(await q(`SELECT w.*,u.name FROM warnings w JOIN users u ON u.id=w.user_id WHERE w.status='pending' ORDER BY w.created_at DESC`)));
app.patch('/api/warnings/:id',requireLogin,admin,async(req,res)=>res.json((await q('UPDATE warnings SET status=$1 WHERE id=$2 RETURNING *',[req.body.status,req.params.id]))[0]));

app.post('/api/study',requireLogin,async(req,res)=>{const mins=Math.max(0,Number(req.body.minutes||0));const rate=Number((await q("SELECT v FROM settings WHERE k='minutePi'"))[0]?.v||10);const gain=mins*rate;await q('UPDATE users SET pi=pi+$1,missions=missions+1 WHERE id=$2',[gain,req.user.id]);res.json({gain})});

app.post('/api/cleanup',requireLogin,admin,async(_,res)=>{const r=await q("DELETE FROM mission_certs WHERE created_at < now()-interval '3 days' RETURNING id");res.json({deleted:r.length})});

app.use(express.static(__dirname));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'index.html')));
init().then(()=>app.listen(process.env.PORT||10000,()=>console.log('π 나침반 server started'))).catch(e=>{console.error(e);process.exit(1)});
