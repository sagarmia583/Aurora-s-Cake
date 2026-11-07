export interface CakeSizeDraft {
  key:string;
  id?:string;
  name:string;
  grams:string;
  regular:string;
  discount:string;
  active:boolean;
}
export interface CakeFormDraft {
  id?:string;
  name:string;
  slug:string;
  categoryId:string;
  description:string;
  imageUrl:string;
  active:boolean;
  featured:boolean;
  flavorIds:string[];
  sizes:CakeSizeDraft[];
}
export interface ValidatedCakeForm {
  productValues:Record<string,string|number|boolean>;
  sizes:{id?:string;values:Record<string,string|number|boolean>}[];
}
export const STANDARD_CAKE_SIZES=[
  '½ পাউন্ড','১ পাউন্ড','১.৫ পাউন্ড','২ পাউন্ড','বেন্টো','পিস','250 ml','500 ml'
] as const;
export const normalizeCakeSlug=(name:string)=>
  name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,65);
const price=(raw:string,label:string,allowBlank=false)=>{
  const value=raw.trim();
  if(allowBlank&&!value)return '';
  if(!/^\d+(?:\.\d{1,2})?$/.test(value))throw new Error(label+' — সঠিক টাকা লিখুন (সর্বোচ্চ ২ দশমিক)।');
  const n=Number(value);
  if(!Number.isFinite(n)||n<0||n>10000000)throw new Error(label+' — দাম ০ থেকে ১০,০০,০০০ টাকার মধ্যে হতে হবে।');
  return n;
};
export function validateCakeEditor(draft:CakeFormDraft,categoryIds:string[],availableFlavorIds:string[]):ValidatedCakeForm {
  const name=draft.name.trim();
  if(!name||name.length>140)throw new Error('কেকের নাম লিখুন (সর্বোচ্চ ১৪০ অক্ষর)।');
  if(!categoryIds.includes(draft.categoryId))throw new Error('একটি বিদ্যমান Cake Category নির্বাচন করুন।');
  if(draft.description.length>5000||draft.imageUrl.length>3000)
    throw new Error('Description বা ছবি URL অনেক বড়।');
  if(draft.imageUrl&&!/^https:\/\/[^\s<>"']+$/.test(draft.imageUrl)&&
      !/^\/(?:api\/image\?id=[A-Za-z0-9_-]{12,150}|images\/[a-zA-Z0-9_./-]+)$/.test(draft.imageUrl))
    throw new Error('ছবির জন্য HTTPS লিংক বা পূর্বের Website Image Path ব্যবহার করুন।');
  const slug=draft.slug.trim();
  if(!draft.id&&!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))throw new Error('কেকের Slug ইংরেজি ছোট হাতের অক্ষর, সংখ্যা ও হাইফেন দিয়ে লিখুন।');
  if(!draft.sizes.length||draft.sizes.length>24)throw new Error('১ থেকে ২৪টি Size যোগ করুন।');
  const names=new Set<string>();
  const sizes=draft.sizes.map((size,index)=>{
    const sizeName=size.name.trim();
    if(!sizeName||sizeName.length>120)throw new Error('Size '+(index+1)+'-এর নাম লিখুন।');
    const key=sizeName.toLocaleLowerCase();
    if(names.has(key))throw new Error('একই কেকের একাধিক Size-এর নাম এক হতে পারবে না।');
    names.add(key);
    const regular=price(size.regular,sizeName+' Regular Price');
    if(regular===''||regular<=0)throw new Error(sizeName+' — Regular Price অবশ্যই শূন্যের বেশি হতে হবে।');
    const discount=price(size.discount,sizeName+' Discount Price',true);
    if(discount!==''&&discount>=regular)throw new Error(sizeName+' — Discount Price অবশ্যই Regular Price-এর কম হতে হবে।');
    const gramsRaw=size.grams.trim();
    if(gramsRaw&&!/^\d{1,7}$/.test(gramsRaw))throw new Error(sizeName+' — Weight (grams) পূর্ণ সংখ্যা হবে।');
    return {id:size.id,values:{
      name:sizeName,weight_grams:gramsRaw?Number(gramsRaw):0,
      price:regular,sale_price:discount,is_active:size.active
    }};
  });
  const active=sizes.filter(item=>item.values.is_active===true);
  if(!active.length)throw new Error('কমপক্ষে একটি Size Active রাখুন।');
  const defaultRegular=Math.min(...active.map(x=>x.values.price as number));
  const flavors=[...new Set(draft.flavorIds)].filter(id=>availableFlavorIds.includes(id));
  if(flavors.length!==new Set(draft.flavorIds).size)throw new Error('Invalid Flavour selection। Reload করুন।');
  const productValues:Record<string,string|number|boolean>={
    name,category_id:draft.categoryId,
    description:draft.description.trim(),
    image_url:draft.imageUrl.trim(),
    is_featured:draft.featured,
    allowed_flavor_ids:JSON.stringify(flavors),
    base_price:defaultRegular,
    // Discounts are always priced per-variant. Do not propagate a
    // product-level sale to other sizes through legacy fallback logic.
    sale_price:'',
  };
  if(!draft.id)productValues.slug=slug;
  return {productValues,sizes};
}
