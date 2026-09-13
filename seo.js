/* Shared by static publishing and live product pages; no extra API requests. */
const DSB_SEO=(()=>{
  const basePath=id=>'products/p-'+Array.from(new TextEncoder().encode(String(id)),b=>b.toString(16).padStart(2,'0')).join('')+'.html';
  const categoryPath=category=>'categories/'+(String(category).trim().toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'')||'category')+'-'+Array.from(new TextEncoder().encode(String(category)),b=>b.toString(16).padStart(2,'0')).join('')+'.html';
  const val=(p,k)=>String(p[k]??'').trim();
  const details=p=>[['Brand','brand'],['Size','variantsize'],['Colour','variantcolor'],['Material','material'],['Pack / quantity','packsize'],['Product details','specifications'],['Combo includes','bundlecontents']].filter(([,k])=>val(p,k)).map(([label,k])=>[label,val(p,k)]);
  const name=p=>[p.name,p.variantlabel].filter(Boolean).join(' — ');
  const description=p=>[val(p,'description'),...details(p).map(([k,v])=>k+': '+v)].filter(Boolean).join(' · ') || name(p)+' at Dhatterwal Suhag Bhandar in Goluwala, Rajasthan. Contact the shop for further product details.';
  const absolute=(src,site)=>{try{const u=new URL(src,site+'/');return /^https?:$/.test(u.protocol)&&u.hostname!=='placehold.co'?u.href:'';}catch(_){return '';}};
  function sizePrices(p){const map=Object.create(null);val(p,'sizeprices').split(',').forEach(e=>{const a=e.split('=');if(a.length===2&&Number(a[1])>0)map[a[0].trim()]=Number(a[1]);});return map;}
  function product(p,rows,site,language='en'){
    const url=site+'/'+(language==='hi'?'hi/':'')+basePath(p.id),price=Number(p.price);
    const out=String(p.stock).toLowerCase()==='out of stock'||((p.stockqty??p.stockQty)!=null&&String(p.stockqty??p.stockQty)!==''&&Number(p.stockqty??p.stockQty)<=0);
    const images=(p.gallery||[p.image,...val(p,'images').split(',')]).map(x=>x?absolute(x.trim(),site):'').filter(Boolean);
    const result={'@context':'https://schema.org','@type':'Product','@id':url+'#product',name:language==='hi'?(p.namehindi||p.nameHindi):name(p),description:language==='hi'?p.descriptionhindi:description(p),sku:String(p.id),url,...(images.length?{image:[...new Set(images)]}:{}),...(val(p,'brand')?{brand:{'@type':'Brand',name:p.brand}}:{}),...(val(p,'gtin')?{gtin:val(p,'gtin')}:{}),...(val(p,'variantsize')?{size:val(p,'variantsize')}:{}),...(val(p,'variantcolor')?{color:val(p,'variantcolor')}:{}),...(val(p,'material')?{material:p.material}:{}),additionalProperty:details(p).filter(([k])=>['Pack / quantity','Product details','Combo includes'].includes(k)).map(([name,value])=>({'@type':'PropertyValue',name,value}))};
    if(Number.isFinite(price)&&price>0){
      const offer=(n,url)=>({'@type':'Offer',url,priceCurrency:'INR',price:Number(n).toFixed(2),availability:out?'https://schema.org/OutOfStock':'https://schema.org/InStock',itemCondition:'https://schema.org/NewCondition',seller:{'@type':'Organization',name:'Dhatterwal Suhag Bhandar',url:site+'/'}});
      const sizes=Array.isArray(p.sizes)?p.sizes:val(p,'sizes').split(',').map(x=>x.trim()).filter(Boolean),overrides=sizePrices(p);
      result.offers=sizes.length?sizes.map(size=>offer(overrides[size]||price,url+'?size='+encodeURIComponent(size))):offer(price,url);
    }
    if(p.variantgroup){result.inProductGroupWithID=p.variantgroup;result.isVariantOf={'@id':site+'/#group-'+encodeURIComponent(p.variantgroup)};}
    return result;
  }
  function graph(p,rows,site,language='en'){
    const main=product(p,rows,site,language),siblings=p.variantgroup?rows.filter(x=>x.variantgroup===p.variantgroup):[];
    if(siblings.length<2)return main;
    const dimensions=['variantsize','variantcolor'].filter(k=>siblings.some(x=>val(x,k))).map(k=>'https://schema.org/'+(k==='variantsize'?'size':'color'));
    const group={'@type':'ProductGroup','@id':site+'/#group-'+encodeURIComponent(p.variantgroup),name:p.name,productGroupID:p.variantgroup,...(dimensions.length?{variesBy:dimensions}:{}),hasVariant:siblings.map(x=>{const v=product(x,rows,site);delete v['@context'];return v;})};
    return {'@context':'https://schema.org','@graph':[main,group]};
  }
  const breadcrumbs=(p,site,lang='en')=>({'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[{name:lang==='hi'?'दुकान':'Shop',item:site+'/'},{name:p.category||'Other',item:site+'/'+categoryPath(p.category||'Other')},{name:p.name,item:site+'/'+basePath(p.id)}].map((x,i)=>({'@type':'ListItem',position:i+1,...x}))});
  return {productPath:basePath,categoryPath,details,name,description,product,graph,breadcrumbs};
})();
if(typeof module!=='undefined')module.exports=DSB_SEO;
