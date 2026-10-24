import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, CakeSlice, Check, ChevronDown, Flower2, Heart, Leaf, Plus, Truck } from 'lucide-react';
import { Product, Category, ShopSettings, Flavor, Banner, Review } from '../types';

interface CustomerStorefrontProps {
  settings: ShopSettings;
  products: Product[];
  categories: Category[];
  flavors: Flavor[];
  banners: Banner[];
  reviews: Review[];
  currency: string;
  onSelectProduct: (product: Product) => void;
  onOpenTrackOrder: () => void;
  onOpenCustomCake: () => void;
  onOpenProfile?: () => void;
  searchQuery: string;
}

const categoryLabels: Record<string, string> = {
  'birthday-cakes': 'Birthday cakes',
  'chocolate-cakes': 'Chocolate',
  'wedding-anniversary': 'Wedding & anniversary',
  cheesecakes: 'Cheesecakes',
  'cupcakes-pastries': 'Cupcakes',
};

function startingPrice(product: Product) {
  const prices = product.variants.filter(v => v.is_active).map(v => v.sale_price ?? v.price);
  return prices.length ? Math.min(...prices) : product.sale_price ?? product.base_price;
}

const faq = [
  ['Can I make a cake my own?', 'Absolutely. Choose your cake size and flavour, add a personal message, then finish with candles, a topper or a little extra. Each cake page shows the available options.'],
  ['How do custom cakes work?', 'Open our custom cake studio, tell us the occasion, flavours and colours you have in mind, and add a reference image link if you have one. You can review an estimate before saving your request.'],
  ['Where can I see delivery options?', 'The checkout shows the available delivery zones, delivery fees, dates and time slots. Select your zone to see the total before placing an order.'],
  ['Can I place a real order on this website?', 'This rebuilt website is currently a preview. Checkout and custom requests are saved on this device for demonstration; no payment is collected and no order is sent to the bakery.'],
];

export const CustomerStorefront: React.FC<CustomerStorefrontProps> = ({
  settings, products, categories, currency, onSelectProduct, onOpenCustomCake,
  onOpenTrackOrder, onOpenProfile, searchQuery,
}) => {
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('featured');
  const [heroIndex, setHeroIndex] = useState(0);
  const activeProducts = products.filter(p => p.is_active);
  const heroProducts = [activeProducts.find(p => p.id === 'prod-5'), activeProducts.find(p => p.id === 'prod-2'), activeProducts.find(p => p.id === 'prod-1')].filter(Boolean) as Product[];
  const heroProduct = heroProducts[heroIndex % (heroProducts.length || 1)];
  const heroPhotos = ['/images/floral-signature.webp', '/images/red-velvet.webp', '/images/chocolate-fudge.webp'];
  const filtered = useMemo(() => products.filter(p => p.is_active)
    .filter(p => category === 'all' || p.category_id === category)
    .filter(p => `${p.name} ${p.description} ${p.category_name || ''}`.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    .sort((a, b) => sort === 'price-low' ? startingPrice(a) - startingPrice(b) : sort === 'price-high' ? startingPrice(b) - startingPrice(a) : Number(b.is_featured) - Number(a.is_featured)), [products, category, sort, searchQuery]);
  const money = (amount: number) => `${currency}${amount.toLocaleString('en-BD')}`;

  return <div className="ac-storefront">
    <section className="ac-hero ac-container" aria-labelledby="hero-heading">
      <div className="ac-hero-copy">
        <span className="ac-eyebrow"><span className="ac-tiny-line" /> A little joy, beautifully baked</span>
        <h1 id="hero-heading">Life’s sweetest<br />moments start<br />with <em>cake.</em><span className="ac-heading-flower" aria-hidden="true">✳</span></h1>
        <p>For the big celebrations. The little victories.<br className="ac-desktop-break" /> And all the just-because moments in between.</p>
        <div className="ac-hero-actions">
          <a href="#catalog" className="ac-button">Find your perfect cake <ArrowUpRight size={17} /></a>
          <button onClick={onOpenCustomCake} className="ac-text-button">Make it your own <ArrowRight size={16} /></button>
        </div>
        <div className="ac-hero-footnote"><Heart size={15} strokeWidth={1.5} /> A personal touch in every celebration.</div>
      </div>
      <div className="ac-hero-visual">
        <div className="ac-hero-backdrop" />
        <div className="ac-hero-image-wrap">
          <img className="ac-hero-image" src={heroPhotos[heroIndex % heroPhotos.length]} alt={heroIndex === 0 ? 'A celebration cake with delicate finishing touches' : heroProduct?.name || 'Celebration cake'} fetchPriority="high" width="1000" height="1200" />
          <div className="ac-hero-image-shade" />
          <div className="ac-hero-image-caption"><span>The celebration collection</span><span>A little slice of lovely.</span></div>
        </div>
        <div className="ac-love-stamp" aria-hidden="true"><span>MADE FOR</span><Flower2 size={34} strokeWidth={1} /><span>SWEET MOMENTS</span></div>
        <span className="ac-hero-sparkle ac-sparkle-one" aria-hidden="true">✧</span>
        <span className="ac-hero-sparkle ac-sparkle-two" aria-hidden="true">✧</span>
        <div className="ac-hero-card">
          <div><span className="ac-eyebrow">A reason to celebrate</span><strong>{heroProduct?.name || 'Something lovely, just for you'}</strong></div>
          <button aria-label="Show next celebration cake" onClick={() => setHeroIndex(i => (i + 1) % heroPhotos.length)}><ArrowRight size={20} /></button>
        </div>
      </div>
      <a href="#catalog" className="ac-scroll-note"><ArrowDown size={13} /> A little happiness awaits</a>
    </section>

    <div className="ac-promise-strip"><div className="ac-container ac-promises">
      <span><CakeSlice size={20} strokeWidth={1.2} /> Thoughtfully crafted cakes</span><i />
      <span><Flower2 size={20} strokeWidth={1.2} /> Made personal, by you</span><i />
      <span><Truck size={20} strokeWidth={1.2} /> A sweet delivery to your door</span>
    </div></div>

    <section id="catalog" className="ac-catalog ac-container" aria-labelledby="catalog-heading">
      <div className="ac-section-heading"><div><span className="ac-eyebrow">The cake collection</span><h2 id="catalog-heading">Find your <em>happy cake.</em></h2></div><p>A whole lot of flavour.<br />A little something for everyone.</p></div>
      <div className="ac-catalog-toolbar">
        <div className="ac-filter-chips" role="group" aria-label="Filter cakes by category">
          <button aria-pressed={category === 'all'} className={category === 'all' ? 'is-active' : ''} onClick={() => setCategory('all')}>All cakes <span>{activeProducts.length}</span></button>
          {categories.filter(c => c.is_active).sort((a,b) => a.sort_order - b.sort_order).map(c => <button key={c.id} aria-pressed={category === c.id} className={category === c.id ? 'is-active' : ''} onClick={() => setCategory(c.id)}>{categoryLabels[c.slug] || c.name}</button>)}
        </div>
        <label className="ac-sort"><span className="sr-only">Sort cakes</span><select value={sort} onChange={e => setSort(e.target.value)}><option value="featured">Our favourites</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select><ChevronDown size={14} /></label>
      </div>
      <div className="ac-results-line" aria-live="polite">{searchQuery ? `Results for “${searchQuery}” · ` : ''}{filtered.length} {filtered.length === 1 ? 'lovely cake' : 'lovely cakes'} to discover</div>
      <div className="ac-product-grid">
        {filtered.map((product, index) => <article className="ac-product" key={product.id}>
          <button className="ac-product-image-button" onClick={() => onSelectProduct(product)} aria-label={`Choose ${product.name}`}>
            <img src={product.image_url} alt={product.name} loading="lazy" width="800" height="800" />
            {product.is_featured && <span className="ac-product-tag">{product.category_id === 'cat-2' ? 'A chocolate love story' : 'The signature collection'}</span>}
            <span className="ac-product-hover">Make it yours <ArrowUpRight size={15}/></span>
          </button>
          <div className="ac-product-info"><div><span className="ac-product-category">{categoryLabels[categories.find(c => c.id === product.category_id)?.slug || ''] || product.category_name}</span><h3><button onClick={() => onSelectProduct(product)}>{product.name}</button></h3><p>From <strong>{money(startingPrice(product))}</strong><span> / {product.variants.filter(v => v.is_active).sort((a,b) => (a.sale_price ?? a.price) - (b.sale_price ?? b.price))[0]?.name.split(' (')[0] || 'cake'}</span></p></div><button className="ac-add-cake" onClick={() => onSelectProduct(product)} aria-label={`Customize ${product.name}`}><Plus size={20} strokeWidth={1.4} /></button></div>
        </article>)}
      </div>
      {!filtered.length && <div className="ac-empty"><CakeSlice size={42} strokeWidth={1}/><h3>No cakes found just yet.</h3><p>Try a different search or explore another collection.</p><button className="ac-text-button" onClick={() => setCategory('all')}>Show all categories <ArrowRight size={15}/></button></div>}
      <div className="ac-catalog-note"><Leaf size={15} strokeWidth={1.2}/> A little note: please share any allergies or dietary needs in your order notes.</div>
    </section>

    <section className="ac-custom-section" aria-labelledby="custom-heading"><div className="ac-custom-inner ac-container">
      <div className="ac-custom-visual"><div className="ac-custom-image"><img src="/images/floral-signature.webp" alt="A celebration cake for a special occasion" loading="lazy" width="800" height="900"/></div><div className="ac-custom-label"><span>YOUR OCCASION.</span><span>Your kind of magic.</span></div><span className="ac-custom-doodle" aria-hidden="true">✳</span></div>
      <div className="ac-custom-copy"><span className="ac-eyebrow">The custom cake studio</span><h2 id="custom-heading">You dream it.<br />We’ll make it <em>cake.</em></h2><p>A favourite colour. An inside joke. A wildly wonderful idea. Let’s turn the things that make you, you, into a cake worth celebrating.</p><div className="ac-custom-steps"><span><Check size={14}/> Choose your flavours</span><span><Check size={14}/> Add your little details</span><span><Check size={14}/> Make it a moment</span></div><button onClick={onOpenCustomCake} className="ac-button">Create your dream cake <ArrowUpRight size={17}/></button><span className="ac-custom-small">Every lovely idea starts with a conversation.</span></div>
    </div></section>

    <section id="our-story" className="ac-story ac-container" aria-labelledby="story-heading">
      <div className="ac-story-words"><span className="ac-eyebrow">A note from Aurora’s</span><h2 id="story-heading">More than a cake.<br /><em>A way to say you care.</em></h2><p>“Happy birthday.” “I’m proud of you.” “Just because.”<br />Sometimes, the sweetest things are the ones we share.</p><p>Aurora’s Cake is a place for those moments — with a collection of celebration cakes and thoughtful details to make each one feel a little more like you.</p><a href="#catalog" className="ac-text-button">Find something to share <ArrowRight size={16}/></a><span className="ac-story-signature">With love, Aurora’s</span></div>
      <div className="ac-story-image"><img src="/images/floral-cake.webp" alt="A selection of cupcakes to share" loading="lazy" width="800" height="800"/><div className="ac-story-image-note"><Heart size={16} strokeWidth={1.3}/><span>Little things.<br />Lovely memories.</span></div></div>
    </section>

    <section className="ac-faq ac-container" aria-labelledby="faq-heading"><div><span className="ac-eyebrow">The little details</span><h2 id="faq-heading">Good things<br /><em>to know.</em></h2><p>A few answers before<br />your first bite.</p></div><div className="ac-faq-list">{faq.map(([question, answer]) => <details key={question}><summary>{question}<Plus size={18} strokeWidth={1.3}/></summary><p>{answer}</p></details>)}</div></section>

    <footer className="ac-footer"><div className="ac-container"><div className="ac-footer-top"><div className="ac-footer-brand"><Flower2 size={32} strokeWidth={1}/><a href="#top">Aurora’s Cake<span>A LITTLE SLICE OF HAPPINESS</span></a></div><p>For moments worth<br /><em>making sweeter.</em></p><a href="#catalog" className="ac-footer-round" aria-label="Explore our cakes"><ArrowUpRight size={28} strokeWidth={1}/></a></div><div className="ac-footer-links"><nav aria-label="Footer"><a href="#catalog">Our cakes</a><button onClick={onOpenCustomCake}>Custom cakes</button><a href="#our-story">Our story</a><button onClick={onOpenTrackOrder}>Track an order</button>{onOpenProfile && <button onClick={onOpenProfile}>My orders</button>}</nav><span>{settings.address.includes('Tangail') ? 'Tangail, Bangladesh' : settings.address}</span></div><div className="ac-footer-bottom"><span>© {new Date().getFullYear()} Aurora’s Cake</span><span>Website preview · Orders stay on your device · No payment collected</span><span>Made for sweet moments ♡</span></div></div></footer>
  </div>;
};
