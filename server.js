const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto'),url=require('url');
const PORT=3000,UP=path.join(__dirname,'uploads'),DF=path.join(__dirname,'data','videos.json'),CF=path.join(__dirname,'data','comments.json');
[UP,path.dirname(DF)].forEach(d=>fs.mkdirSync(d,{recursive:true}));
function rj(f,d=[]){try{return JSON.parse(fs.readFileSync(f,'utf8'))}catch{return d}}
function wj(f,d){fs.writeFileSync(f,JSON.stringify(d,null,2),'utf8')}
const MIME={'.html':'text/html;charset=utf-8','.mp4':'video/mp4','.webm':'video/webm','.mov':'video/quicktime','.avi':'video/x-msvideo','.json':'application/json'};
function mime(e){return MIME[e.toLowerCase()]||'application/octet-stream'}
function parseMP(buf,bnd){
  const b=Buffer.from('--'+bnd),fields={},files={};
  let pos=0;
  while(pos<buf.length){
    let bs=buf.indexOf(b,pos);if(bs===-1)break;bs+=b.length;
    if(buf.slice(bs,bs+2).toString()==='--')break;
    bs+=2;
    const he=buf.indexOf(Buffer.from('\r\n\r\n'),bs);if(he===-1)break;
    const hdr=buf.slice(bs,he).toString();
    const dm=hdr.match(/name="([^"]+)"/i),fn=hdr.match(/filename="([^"]*)"/i),ct=hdr.match(/Content-Type:\s*([^\r\n]+)/i);
    if(!dm){pos=he+4;continue;}
    const bods=he+4,nb=buf.indexOf(b,bods),bode=nb===-1?buf.length:nb-2;
    if(fn){files[dm[1]]={filename:fn[1],contentType:ct?ct[1].trim():'application/octet-stream',data:buf.slice(bods,bode)};}
    else{fields[dm[1]]=buf.slice(bods,bode).toString();}
    pos=nb===-1?buf.length:nb;
  }
  return{fields,files};
}
function body(req){return new Promise((res,rej)=>{const c=[];req.on('data',d=>c.push(d));req.on('end',()=>res(Buffer.concat(c)));req.on('error',rej);})}
function sj(res,code,data){const b=JSON.stringify(data);res.writeHead(code,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});res.end(b);}
function sv(req,res,fp){
  fs.stat(fp,(err,st)=>{
    if(err){sj(res,404,{error:'not found'});return;}
    const ext=path.extname(fp),sz=st.size,rng=req.headers.range;
    if(rng){
      const pts=rng.replace(/bytes=/,'').split('-'),s=parseInt(pts[0]),e=pts[1]?parseInt(pts[1]):Math.min(s+10*1024*1024,sz-1),cs=e-s+1;
      res.writeHead(206,{'Content-Range':`bytes ${s}-${e}/${sz}`,'Accept-Ranges':'bytes','Content-Length':cs,'Content-Type':mime(ext)});
      fs.createReadStream(fp,{start:s,end:e}).pipe(res);
    } else {
      res.writeHead(200,{'Content-Length':sz,'Content-Type':mime(ext),'Accept-Ranges':'bytes'});
      fs.createReadStream(fp).pipe(res);
    }
  });
}
http.createServer(async(req,res)=>{
  const p=url.parse(req.url,true).pathname,m=req.method;
  if(m==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PUT','Access-Control-Allow-Headers':'Content-Type'});res.end();return;}
  if(m==='GET'&&p==='/api/videos'){sj(res,200,rj(DF,[]).reverse());return;}
  if(m==='POST'&&p==='/api/videos'){
    try{
      const ct=req.headers['content-type']||'',bnd=ct.match(/boundary=([^\s;]+)/);
      if(!bnd){sj(res,400,{error:'no boundary'});return;}
      const raw=await body(req),pr=parseMP(raw,bnd[1]),{fields,files}=pr;
      if(!files.video){sj(res,400,{error:'no video'});return;}
      if(!fields.title||!fields.title.trim()){sj(res,400,{error:'no title'});return;}
      const oe=path.extname(files.video.filename)||'.mp4';
      const se=['.mp4','.webm','.mov','.avi'].includes(oe.toLowerCase())?oe.toLowerCase():'.mp4';
      const fid=crypto.randomBytes(8).toString('hex'),fn=fid+se,fp=path.join(UP,fn);
      fs.writeFileSync(fp,files.video.data);
      const v={id:fid,title:fields.title.trim(),chan:(fields.chan||'ANONYME').toUpperCase().trim(),cat:fields.cat||'AUTRE',desc:fields.desc||'',tags:fields.tags||'',dur:fields.dur||'--',filename:fn,url:'/uploads/'+fn,views:0,came:0,nope:0,date:new Date().toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'}),ts:Date.now()};
      const vs=rj(DF,[]);vs.push(v);wj(DF,vs);sj(res,201,v);
    }catch(e){console.error(e);sj(res,500,{error:e.message});}
    return;
  }
  if(m==='PUT'&&p.match(/^\/api\/videos\/[^/]+\/vote$/)){
    try{const id=p.split('/')[3],b=await body(req),{type}=JSON.parse(b.toString());
    const vs=rj(DF,[]),v=vs.find(x=>x.id===id);if(!v){sj(res,404,{error:'not found'});return;}
    v[type]=(v[type]||0)+1;wj(DF,vs);sj(res,200,{came:v.came,nope:v.nope});}catch(e){sj(res,500,{error:e.message});}
    return;
  }
  if(m==='PUT'&&p.match(/^\/api\/videos\/[^/]+\/view$/)){
    try{const id=p.split('/')[3],vs=rj(DF,[]),v=vs.find(x=>x.id===id);
    if(v){v.views=(v.views||0)+1;wj(DF,vs);}sj(res,200,{views:v?v.views:0});}catch(e){sj(res,500,{error:e.message});}
    return;
  }
  if(m==='GET'&&p.match(/^\/api\/videos\/[^/]+\/comments$/)){
    const id=p.split('/')[3],cs=rj(CF,{});sj(res,200,cs[id]||[]);return;
  }
  if(m==='POST'&&p.match(/^\/api\/videos\/[^/]+\/comments$/)){
    try{const id=p.split('/')[3],b=await body(req),{user,text}=JSON.parse(b.toString());
    if(!text||!text.trim()){sj(res,400,{error:'empty'});return;}
    const cs=rj(CF,{});if(!cs[id])cs[id]=[];
    const c={id:crypto.randomBytes(4).toString('hex'),user:(user||'ANONYME').slice(0,30),text:text.trim().slice(0,1000),time:new Date().toLocaleString('fr-FR'),likes:0};
    cs[id].unshift(c);wj(CF,cs);sj(res,201,c);}catch(e){sj(res,500,{error:e.message});}
    return;
  }
  if(m==='GET'&&p.startsWith('/uploads/')){
    const fp=path.join(UP,path.basename(p));if(!fs.existsSync(fp)){sj(res,404,{error:'not found'});return;}sv(req,res,fp);return;
  }
  if(m==='GET'&&(p==='/'||p==='/index.html')){
    const hp=path.join(__dirname,'public','index.html');
    if(fs.existsSync(hp)){res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});fs.createReadStream(hp).pipe(res);}
    else{sj(res,404,{error:'index.html not found'});}
    return;
  }
  sj(res,404,{error:'not found: '+p});
}).listen(PORT,()=>console.log(`\n🔥 100%MALES → http://localhost:${PORT}\n`));
