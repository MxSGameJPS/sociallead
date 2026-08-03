import fs from "node:fs/promises";
import path from "node:path";
import { generateWithDefaultProvider } from "../ai/providerService.js";

const GENERATED_ROOT = path.join(process.cwd(), "generated-sites");
const PLACE_DETAILS_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "nationalPhoneNumber",
  "websiteUri",
  "rating",
  "userRatingCount",
  "googleMapsUri",
  "regularOpeningHours",
  "editorialSummary",
  "photos",
].join(",");

function clean(value, max = 5000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

export function slugifySiteName(value) {
  return clean(value, 180)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "site-gerado";
}

function safeColor(value, fallback) {
  const color = clean(value, 20);
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : fallback;
}

function safeUrl(value) {
  const url = clean(value, 1000);
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function mobileWhatsapp(phone) {
  let digits = clean(phone, 40).replace(/\D/g, "");
  if (!digits) return "";
  if (!digits.startsWith("55")) digits = `55${digits}`;
  return /^55\d{2}9\d{8}$/.test(digits) ? digits : "";
}

function fallbackSpec(input) {
  const segment = input.segment || "negócio local";
  const city = input.city || "sua região";
  return {
    brandName: input.name,
    eyebrow: `${segment} em ${city}`,
    heroTitle: `${input.name}: atendimento próximo, informação clara e contato direto`,
    heroText: input.editorialSummary || `Conheça a estrutura, os serviços e os canais de atendimento da ${input.name}.`,
    primaryCta: "Falar com a equipe",
    secondaryCta: "Ver localização",
    aboutTitle: `Sobre a ${input.name}`,
    aboutText: input.editorialSummary || `Uma apresentação objetiva da ${input.name}, preparada para facilitar o contato e transmitir confiança desde a primeira visita.`,
    servicesTitle: "Como podemos ajudar",
    services: [
      { title: "Atendimento direto", description: "Contato simples e rápido para tirar dúvidas e solicitar informações." },
      { title: "Experiência local", description: `Presença em ${city}, com foco em atender o público da região.` },
      { title: "Informações organizadas", description: "Endereço, horários e canais reunidos em um só lugar." },
    ],
    proofTitle: "Confiança construída no atendimento",
    proofText: input.rating ? `Avaliação ${input.rating} no Google, com ${input.reviews || 0} avaliações registradas.` : "Informações claras para ajudar o cliente a tomar uma decisão com segurança.",
    contactTitle: "Vamos conversar?",
    contactText: "Entre em contato para confirmar disponibilidade, horários e condições de atendimento.",
    seoTitle: `${input.name} | ${segment} em ${city}`,
    seoDescription: `Conheça a ${input.name}, ${segment} em ${city}. Veja informações, localização e formas de contato.`,
    colors: { primary: "#14213D", accent: "#D9A441", background: "#F4F1EA", text: "#171717" },
  };
}

function normalizeServices(value, fallback) {
  if (!Array.isArray(value)) return fallback;
  const services = value.slice(0, 6).map(item => ({
    title: clean(item?.title, 90),
    description: clean(item?.description, 260),
  })).filter(item => item.title && item.description);
  return services.length >= 3 ? services : fallback;
}

function normalizeSpec(value, input) {
  const fallback = fallbackSpec(input);
  const data = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    brandName: clean(data.brandName, 120) || fallback.brandName,
    eyebrow: clean(data.eyebrow, 100) || fallback.eyebrow,
    heroTitle: clean(data.heroTitle, 180) || fallback.heroTitle,
    heroText: clean(data.heroText, 500) || fallback.heroText,
    primaryCta: clean(data.primaryCta, 60) || fallback.primaryCta,
    secondaryCta: clean(data.secondaryCta, 60) || fallback.secondaryCta,
    aboutTitle: clean(data.aboutTitle, 120) || fallback.aboutTitle,
    aboutText: clean(data.aboutText, 900) || fallback.aboutText,
    servicesTitle: clean(data.servicesTitle, 120) || fallback.servicesTitle,
    services: normalizeServices(data.services, fallback.services),
    proofTitle: clean(data.proofTitle, 120) || fallback.proofTitle,
    proofText: clean(data.proofText, 500) || fallback.proofText,
    contactTitle: clean(data.contactTitle, 120) || fallback.contactTitle,
    contactText: clean(data.contactText, 500) || fallback.contactText,
    seoTitle: clean(data.seoTitle, 70) || fallback.seoTitle,
    seoDescription: clean(data.seoDescription, 170) || fallback.seoDescription,
    colors: {
      primary: safeColor(data.colors?.primary, fallback.colors.primary),
      accent: safeColor(data.colors?.accent, fallback.colors.accent),
      background: safeColor(data.colors?.background, fallback.colors.background),
      text: safeColor(data.colors?.text, fallback.colors.text),
    },
  };
}

function parseAiJson(text) {
  const raw = clean(text, 20000).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("A IA não retornou JSON reconhecível.");
  return JSON.parse(raw.slice(start, end + 1));
}

async function fetchPlaceDetails(placeId) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey || !placeId) return null;
  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=pt-BR&regionCode=BR`, {
    headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": PLACE_DETAILS_MASK },
    cache: "no-store",
  });
  if (!response.ok) return null;
  return response.json();
}

function extensionFromType(type) {
  const normalized = clean(type, 100).toLowerCase();
  if (normalized.includes("png")) return "png";
  if (normalized.includes("webp")) return "webp";
  return "jpg";
}

async function downloadPlacePhotos(place, publicDir) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const photos = Array.isArray(place?.photos) ? place.photos.slice(0, 4) : [];
  if (!apiKey || !photos.length) return { images: [], attributions: [] };

  const imageDir = path.join(publicDir, "images");
  await fs.mkdir(imageDir, { recursive: true });
  const images = [];
  const attributions = [];

  for (let index = 0; index < photos.length; index++) {
    const photo = photos[index];
    if (!photo?.name) continue;
    try {
      const mediaResponse = await fetch(`https://places.googleapis.com/v1/${photo.name}/media?maxWidthPx=1800&skipHttpRedirect=true&key=${encodeURIComponent(apiKey)}`, { cache: "no-store" });
      if (!mediaResponse.ok) continue;
      const media = await mediaResponse.json();
      const uri = safeUrl(media.photoUri);
      if (!uri) continue;
      const imageResponse = await fetch(uri, { cache: "no-store" });
      if (!imageResponse.ok) continue;
      const extension = extensionFromType(imageResponse.headers.get("content-type"));
      const fileName = `google-place-${index + 1}.${extension}`;
      const buffer = Buffer.from(await imageResponse.arrayBuffer());
      await fs.writeFile(path.join(imageDir, fileName), buffer);
      images.push(`/images/${fileName}`);
      for (const author of photo.authorAttributions || []) {
        const name = clean(author?.displayName, 160);
        const uriValue = safeUrl(author?.uri);
        if (name && !attributions.some(item => item.name === name && item.uri === uriValue)) attributions.push({ name, uri: uriValue });
      }
    } catch {
      // Uma foto indisponível não deve impedir a criação do projeto.
    }
  }

  return { images, attributions };
}

function buildAiPrompt(input) {
  const facts = {
    name: input.name,
    segment: input.segment,
    city: input.city,
    address: input.address,
    phone: input.phone,
    rating: input.rating,
    reviews: input.reviews,
    editorialSummary: input.editorialSummary,
    openingHours: input.openingHours,
    existingWebsite: input.existingWebsite,
    template: input.template,
    description: input.description,
  };

  return {
    systemPrompt: [
      "Você é diretor de criação, redator e estrategista de conversão para sites profissionais de pequenos negócios brasileiros.",
      "Produza conteúdo específico, sóbrio e humano, sem aparência genérica de site feito por IA.",
      "Use exclusivamente os fatos fornecidos. Não invente serviços, preços, promoções, resultados, prêmios, depoimentos, tempo de mercado ou diferenciais não comprovados.",
      "Não use emojis. Não use hashtags. Não use clichês como 'transformando sonhos em realidade', 'excelência que inspira' ou 'soluções inovadoras' sem base factual.",
      "Retorne apenas um objeto JSON válido, sem markdown, comentários ou texto antes e depois.",
    ].join(" "),
    prompt: [
      "Crie a direção de conteúdo de uma prévia comercial de site.",
      "O visual será implementado por um template editorial profissional com ícones SVG; concentre-se em textos claros e hierarquia comercial.",
      "O rodapé será obrigatoriamente assinado como: Prévia desenvolvida por Saulo Pavanello.",
      "Formato obrigatório:",
      JSON.stringify({
        brandName: "",
        eyebrow: "",
        heroTitle: "",
        heroText: "",
        primaryCta: "",
        secondaryCta: "",
        aboutTitle: "",
        aboutText: "",
        servicesTitle: "",
        services: [{ title: "", description: "" }, { title: "", description: "" }, { title: "", description: "" }],
        proofTitle: "",
        proofText: "",
        contactTitle: "",
        contactText: "",
        seoTitle: "",
        seoDescription: "",
        colors: { primary: "#000000", accent: "#000000", background: "#000000", text: "#000000" },
      }, null, 2),
      "DADOS CONFIÁVEIS DO NEGÓCIO:",
      JSON.stringify(facts, null, 2),
    ].join("\n"),
  };
}

async function uniqueFolder(name) {
  await fs.mkdir(GENERATED_ROOT, { recursive: true });
  const base = slugifySiteName(name);
  let candidate = base;
  let index = 2;
  while (true) {
    try {
      await fs.access(path.join(GENERATED_ROOT, candidate));
      candidate = `${base}-${index++}`;
    } catch {
      return { folderName: candidate, absolutePath: path.join(GENERATED_ROOT, candidate) };
    }
  }
}

function pageSource(data) {
  return `const site = ${JSON.stringify(data, null, 2)};

function Icon({ name }) {
  const paths = {
    arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
    phone: <><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.8a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.84.57 2.8.7A2 2 0 0 1 22 16.92Z"/></>,
    pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name] || paths.check}</svg>;
}

export const metadata = { title: site.seoTitle, description: site.seoDescription };

export default function Home() {
  const phoneHref = site.phone ? \`tel:\${site.phone.replace(/[^+\\d]/g, "")}\` : "";
  const whatsappHref = site.whatsapp ? \`https://wa.me/\${site.whatsapp}\` : "";
  const primaryHref = whatsappHref || phoneHref || site.mapsLink || "#contato";
  return <main>
    <header className="siteHeader"><a className="brand" href="#top">{site.brandName}</a><nav><a href="#sobre">Sobre</a><a href="#servicos">Atendimento</a><a href="#contato">Contato</a></nav><a className="headerCta" href={primaryHref} target={primaryHref.startsWith("http") ? "_blank" : undefined} rel="noreferrer"><span>{site.primaryCta}</span><Icon name="arrow"/></a></header>

    <section className="hero" id="top"><div className="heroCopy"><span className="eyebrow">{site.eyebrow}</span><h1>{site.heroTitle}</h1><p>{site.heroText}</p><div className="heroActions"><a className="primary" href={primaryHref} target={primaryHref.startsWith("http") ? "_blank" : undefined} rel="noreferrer"><span>{site.primaryCta}</span><Icon name="arrow"/></a>{site.mapsLink && <a className="secondary" href={site.mapsLink} target="_blank" rel="noreferrer"><Icon name="pin"/><span>{site.secondaryCta}</span></a>}</div><div className="facts">{site.rating && <div><strong>{site.rating}</strong><span>avaliação no Google</span></div>}{site.reviews && <div><strong>{site.reviews}</strong><span>avaliações registradas</span></div>}{site.city && <div><strong>{site.city}</strong><span>localização</span></div>}</div></div><div className="heroMedia">{site.images[0] ? <img src={site.images[0]} alt={site.brandName}/>:<div className="mediaFallback"><span>{site.brandName.slice(0,1)}</span></div>}<div className="mediaNote"><span>Informações essenciais</span><strong>Contato e localização em um só lugar</strong></div></div></section>

    <section className="about" id="sobre"><div className="sectionIndex">01</div><div><span className="sectionLabel">Apresentação</span><h2>{site.aboutTitle}</h2></div><p>{site.aboutText}</p></section>

    <section className="services" id="servicos"><div className="sectionHead"><div><span className="sectionLabel">Atendimento</span><h2>{site.servicesTitle}</h2></div><p>Uma visão direta dos principais pontos de contato e da experiência proposta ao cliente.</p></div><div className="serviceGrid">{site.services.map((service,index)=><article key={service.title}><span>0{index+1}</span><Icon name="check"/><h3>{service.title}</h3><p>{service.description}</p></article>)}</div></section>

    {(site.images[1] || site.images[2]) && <section className="gallery">{site.images.slice(1,3).map((image,index)=><figure key={image}><img src={image} alt={\`\${site.brandName} - ambiente \${index+1}\`}/></figure>)}</section>}

    <section className="proof"><div><span className="sectionLabel">Referência local</span><h2>{site.proofTitle}</h2><p>{site.proofText}</p></div><div className="proofPanel">{site.address && <div><Icon name="pin"/><span><small>Endereço</small><strong>{site.address}</strong></span></div>}{site.hours.length>0&&<div><Icon name="clock"/><span><small>Horários informados</small><strong>{site.hours.slice(0,2).join(" · ")}</strong></span></div>}</div></section>

    <section className="contact" id="contato"><div><span className="sectionLabel">Contato</span><h2>{site.contactTitle}</h2><p>{site.contactText}</p></div><div className="contactActions">{site.phone&&<a href={phoneHref}><Icon name="phone"/><span><small>Telefone</small><strong>{site.phone}</strong></span></a>}{site.mapsLink&&<a href={site.mapsLink} target="_blank" rel="noreferrer"><Icon name="pin"/><span><small>Localização</small><strong>Abrir no Google Maps</strong></span></a>}</div></section>

    <footer><div><strong>{site.brandName}</strong><span>{site.segment}{site.city ? \` · \${site.city}\` : ""}</span></div><p>Prévia desenvolvida por Saulo Pavanello</p></footer>
    {site.attributions.length>0&&<div className="attributions">Fotos: {site.attributions.map((item,index)=><span key={item.name}>{index>0?" · ":""}{item.uri?<a href={item.uri} target="_blank" rel="noreferrer">{item.name}</a>:item.name}</span>)}</div>}
  </main>;
}
`;
}

function layoutSource(data) {
  return `import "./globals.css";

export const metadata = {
  title: ${JSON.stringify(data.seoTitle)},
  description: ${JSON.stringify(data.seoDescription)},
};

export default function RootLayout({ children }) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
`;
}

function cssSource(colors) {
  return `:root{--primary:${colors.primary};--accent:${colors.accent};--paper:${colors.background};--ink:${colors.text};--line:color-mix(in srgb,var(--ink) 16%,transparent);--white:#fff;--shadow:0 24px 70px rgba(15,23,42,.14)}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font-family:Arial,Helvetica,sans-serif;line-height:1.5}a{color:inherit}svg{width:20px;height:20px}.siteHeader{position:sticky;top:0;z-index:20;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:18px clamp(22px,5vw,76px);background:color-mix(in srgb,var(--paper) 92%,transparent);backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}.brand{font-weight:900;text-decoration:none;letter-spacing:-.03em}.siteHeader nav{display:flex;gap:30px}.siteHeader nav a{text-decoration:none;font-size:13px}.headerCta{justify-self:end;display:inline-flex;align-items:center;gap:9px;background:var(--primary);color:#fff;padding:11px 15px;text-decoration:none;font-size:12px;font-weight:800}.hero{min-height:720px;display:grid;grid-template-columns:1.08fr .92fr;padding:clamp(50px,7vw,110px) clamp(22px,6vw,96px);gap:clamp(35px,7vw,110px);align-items:center}.eyebrow,.sectionLabel{display:block;color:var(--primary);font-size:11px;text-transform:uppercase;letter-spacing:.16em;font-weight:900;margin-bottom:18px}.hero h1{font-family:Georgia,'Times New Roman',serif;font-size:clamp(46px,6vw,88px);line-height:.96;letter-spacing:-.045em;margin:0;max-width:900px}.heroCopy>p{font-size:clamp(16px,1.6vw,21px);max-width:680px;color:color-mix(in srgb,var(--ink) 72%,transparent);margin:28px 0}.heroActions{display:flex;gap:12px;flex-wrap:wrap}.primary,.secondary{display:inline-flex;align-items:center;gap:10px;padding:14px 18px;text-decoration:none;font-weight:850;font-size:13px;border:1px solid var(--primary)}.primary{background:var(--primary);color:#fff}.secondary{background:transparent;color:var(--primary)}.facts{display:flex;gap:35px;margin-top:44px;padding-top:24px;border-top:1px solid var(--line);flex-wrap:wrap}.facts div{display:flex;flex-direction:column}.facts strong{font-size:18px}.facts span{font-size:10px;color:color-mix(in srgb,var(--ink) 58%,transparent)}.heroMedia{position:relative;min-height:560px}.heroMedia>img,.mediaFallback{width:100%;height:560px;object-fit:cover;display:block}.mediaFallback{display:grid;place-items:center;background:var(--primary);color:#fff}.mediaFallback span{font-family:Georgia,serif;font-size:180px}.mediaNote{position:absolute;left:-35px;bottom:35px;width:min(320px,80%);background:var(--white);padding:22px;box-shadow:var(--shadow);display:flex;flex-direction:column;gap:6px}.mediaNote span{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:var(--primary);font-weight:900}.mediaNote strong{font-size:15px}.about{display:grid;grid-template-columns:80px 1fr 1fr;gap:40px;padding:100px clamp(22px,6vw,96px);background:var(--primary);color:#fff;align-items:start}.sectionIndex{font-family:Georgia,serif;font-size:50px;color:color-mix(in srgb,#fff 30%,transparent)}.about h2,.sectionHead h2,.proof h2,.contact h2{font-family:Georgia,'Times New Roman',serif;font-size:clamp(36px,4vw,64px);line-height:1;letter-spacing:-.035em;margin:0}.about p{font-size:18px;color:color-mix(in srgb,#fff 76%,transparent);margin:35px 0 0}.about .sectionLabel{color:var(--accent)}.services{padding:110px clamp(22px,6vw,96px)}.sectionHead{display:flex;justify-content:space-between;align-items:end;gap:30px;margin-bottom:50px}.sectionHead>p{max-width:500px;color:color-mix(in srgb,var(--ink) 64%,transparent)}.serviceGrid{display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.serviceGrid article{position:relative;padding:34px;min-height:290px;border-right:1px solid var(--line)}.serviceGrid article:last-child{border-right:0}.serviceGrid article>span{font-size:10px;color:color-mix(in srgb,var(--ink) 50%,transparent)}.serviceGrid article>svg{position:absolute;right:30px;top:30px;color:var(--primary)}.serviceGrid h3{font-family:Georgia,serif;font-size:28px;margin:75px 0 12px}.serviceGrid p{margin:0;color:color-mix(in srgb,var(--ink) 65%,transparent)}.gallery{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:0 clamp(22px,6vw,96px) 110px}.gallery figure{margin:0;height:500px}.gallery img{width:100%;height:100%;object-fit:cover}.proof{display:grid;grid-template-columns:1fr 1fr;gap:70px;background:#fff;padding:110px clamp(22px,6vw,96px)}.proof>div:first-child>p{font-size:18px;color:color-mix(in srgb,var(--ink) 65%,transparent);max-width:650px}.proofPanel{border-top:1px solid var(--line)}.proofPanel>div{display:flex;gap:15px;padding:24px 0;border-bottom:1px solid var(--line)}.proofPanel svg{color:var(--primary);flex:0 0 auto}.proofPanel span{display:flex;flex-direction:column;gap:5px}.proofPanel small{font-size:10px;text-transform:uppercase;color:color-mix(in srgb,var(--ink) 50%,transparent)}.proofPanel strong{font-size:14px}.contact{display:grid;grid-template-columns:1fr 1fr;gap:70px;padding:110px clamp(22px,6vw,96px);background:var(--accent)}.contact>div:first-child>p{font-size:18px;max-width:620px}.contactActions{display:flex;flex-direction:column;border-top:1px solid color-mix(in srgb,var(--ink) 30%,transparent)}.contactActions a{display:flex;align-items:center;gap:16px;padding:22px 0;border-bottom:1px solid color-mix(in srgb,var(--ink) 30%,transparent);text-decoration:none}.contactActions span{display:flex;flex-direction:column}.contactActions small{font-size:10px;text-transform:uppercase}.contactActions strong{font-size:15px}footer{display:flex;justify-content:space-between;gap:30px;padding:34px clamp(22px,6vw,96px);background:var(--ink);color:#fff}footer>div{display:flex;flex-direction:column;gap:4px}footer span,footer p{font-size:10px;color:color-mix(in srgb,#fff 65%,transparent);margin:0}.attributions{padding:8px clamp(22px,6vw,96px);background:var(--ink);color:color-mix(in srgb,#fff 55%,transparent);font-size:8px}.attributions a{color:inherit}@media(max-width:950px){.siteHeader{grid-template-columns:1fr auto}.siteHeader nav{display:none}.hero{grid-template-columns:1fr;min-height:auto}.heroMedia{min-height:480px}.heroMedia>img,.mediaFallback{height:480px}.about{grid-template-columns:60px 1fr}.about>p{grid-column:2}.serviceGrid{grid-template-columns:1fr}.serviceGrid article{border-right:0;border-bottom:1px solid var(--line)}.serviceGrid article:last-child{border-bottom:0}.proof,.contact{grid-template-columns:1fr}.gallery{grid-template-columns:1fr}.gallery figure{height:420px}}@media(max-width:620px){.siteHeader{padding:14px 18px}.headerCta span{display:none}.hero{padding:55px 18px}.hero h1{font-size:47px}.heroMedia{min-height:380px}.heroMedia>img,.mediaFallback{height:380px}.mediaNote{left:14px;bottom:14px}.facts{gap:20px}.about,.services,.proof,.contact{padding:75px 18px}.about{grid-template-columns:1fr}.sectionIndex{display:none}.about>p{grid-column:auto}.sectionHead{align-items:flex-start;flex-direction:column}.gallery{padding:0 18px 75px}.gallery figure{height:330px}footer{flex-direction:column;padding:30px 18px}}
`;
}

export async function generateSiteFolder(input = {}) {
  const name = clean(input.name, 220);
  if (!name) throw new Error("Informe o nome do negócio.");
  const folder = await uniqueFolder(name);
  const publicDir = path.join(folder.absolutePath, "public");
  await fs.mkdir(path.join(folder.absolutePath, "app"), { recursive: true });
  await fs.mkdir(publicDir, { recursive: true });

  const place = await fetchPlaceDetails(clean(input.placeId, 300));
  const placeData = {
    name: clean(place?.displayName?.text, 220) || name,
    segment: clean(input.segment, 140),
    city: clean(input.city, 160),
    address: clean(place?.formattedAddress || input.address, 500),
    phone: clean(place?.nationalPhoneNumber || input.phone, 80),
    rating: place?.rating ?? input.rating ?? null,
    reviews: place?.userRatingCount ?? input.reviews ?? null,
    mapsLink: safeUrl(place?.googleMapsUri || input.mapsLink),
    existingWebsite: safeUrl(place?.websiteUri || input.existingWebsite),
    editorialSummary: clean(place?.editorialSummary?.text || input.description, 1200),
    openingHours: Array.isArray(place?.regularOpeningHours?.weekdayDescriptions) ? place.regularOpeningHours.weekdayDescriptions.slice(0, 7).map(item => clean(item, 180)) : [],
    template: clean(input.template, 80) || "institutional",
    description: clean(input.description, 1600),
  };

  let aiUsed = false;
  let aiWarning = "";
  let spec = fallbackSpec(placeData);
  try {
    const result = await generateWithDefaultProvider(buildAiPrompt(placeData));
    spec = normalizeSpec(parseAiJson(result.text), placeData);
    aiUsed = true;
  } catch (error) {
    aiWarning = `A IA não concluiu a direção de conteúdo: ${error.message}. Foi aplicada uma estrutura profissional segura para edição.`;
    spec = normalizeSpec(spec, placeData);
  }

  const media = await downloadPlacePhotos(place, publicDir);
  const siteData = {
    ...spec,
    segment: placeData.segment,
    city: placeData.city,
    address: placeData.address,
    phone: placeData.phone,
    whatsapp: mobileWhatsapp(placeData.phone),
    rating: placeData.rating ? String(placeData.rating).replace(".", ",") : "",
    reviews: placeData.reviews ? new Intl.NumberFormat("pt-BR").format(Number(placeData.reviews)) : "",
    mapsLink: placeData.mapsLink,
    existingWebsite: placeData.existingWebsite,
    hours: placeData.openingHours,
    images: media.images,
    attributions: media.attributions,
  };

  const packageJson = {
    name: folder.folderName,
    version: "1.0.0",
    private: true,
    scripts: { dev: "next dev", build: "next build", start: "next start" },
    dependencies: { next: "15.1.6", react: "19.0.0", "react-dom": "19.0.0" },
  };

  await Promise.all([
    fs.writeFile(path.join(folder.absolutePath, "package.json"), JSON.stringify(packageJson, null, 2), "utf8"),
    fs.writeFile(path.join(folder.absolutePath, ".gitignore"), "node_modules\n.next\n.env*\n", "utf8"),
    fs.writeFile(path.join(folder.absolutePath, "app", "layout.js"), layoutSource(siteData), "utf8"),
    fs.writeFile(path.join(folder.absolutePath, "app", "page.js"), pageSource(siteData), "utf8"),
    fs.writeFile(path.join(folder.absolutePath, "app", "globals.css"), cssSource(spec.colors), "utf8"),
    fs.writeFile(path.join(folder.absolutePath, "generation-report.json"), JSON.stringify({ generatedAt: new Date().toISOString(), aiUsed, aiWarning, source: place ? "Google Places + CRM" : "CRM", photoAttributions: media.attributions, validationRequired: true }, null, 2), "utf8"),
    fs.writeFile(path.join(folder.absolutePath, "README.md"), `# ${placeData.name}\n\nPrévia profissional gerada pelo LeadFlow.\n\n## Executar\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n\nAbra http://localhost:3000.\n\n## Validação obrigatória\n\n- Revise textos, telefones, horários e serviços antes do deploy.\n- Confirme com o cliente o direito de uso das imagens.\n- Mantenha as atribuições das fotos quando existirem.\n- A assinatura \"Prévia desenvolvida por Saulo Pavanello\" já está aplicada no rodapé.\n`, "utf8"),
  ]);

  return {
    folderName: folder.folderName,
    folderPath: path.relative(process.cwd(), folder.absolutePath).replace(/\\/g, "/"),
    aiUsed,
    warning: aiWarning,
    imageCount: media.images.length,
  };
}
