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

const DIRECTIONS = new Set(["editorial", "cinematic", "precision", "organic", "bold", "minimal"]);
const HERO_LAYOUTS = new Set(["split", "immersive", "asymmetric"]);
const FONT_PAIRS = new Set(["editorial", "modern", "geometric", "humanist", "luxury"]);
const MOTION_LEVELS = new Set(["subtle", "standard", "expressive"]);
const RADIUS_LEVELS = new Set(["sharp", "soft", "rounded"]);

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

function segmentIncludes(segment, words) {
  const normalized = clean(segment, 200).toLocaleLowerCase("pt-BR");
  return words.some(word => normalized.includes(word));
}

function fallbackDesign(input) {
  const segment = input.segment || "negócio local";

  if (segmentIncludes(segment, ["restaurante", "pizz", "caf", "bar", "padaria", "hamburg", "marmit", "sorvet"])) {
    return {
      direction: "cinematic",
      heroLayout: "asymmetric",
      fontPair: "editorial",
      motion: "expressive",
      radius: "soft",
      signatureLabel: "Sabor, presença e experiência local",
      colors: { primary: "#5A1F16", accent: "#E6A93D", background: "#F8F3EA", surface: "#FFFDF8", text: "#1F1714", muted: "#75665F" },
    };
  }

  if (segmentIncludes(segment, ["advoc", "contab", "segur", "imobili", "clínica", "medic", "odont", "laboratório"])) {
    return {
      direction: "precision",
      heroLayout: "split",
      fontPair: "modern",
      motion: "standard",
      radius: "sharp",
      signatureLabel: "Clareza para decidir com confiança",
      colors: { primary: "#10253F", accent: "#C89B4A", background: "#F3F5F7", surface: "#FFFFFF", text: "#111A24", muted: "#66717D" },
    };
  }

  if (segmentIncludes(segment, ["estética", "beleza", "salão", "manicure", "spa", "pilates", "yoga", "nutri", "psico", "fisi"])) {
    return {
      direction: "organic",
      heroLayout: "immersive",
      fontPair: "humanist",
      motion: "standard",
      radius: "rounded",
      signatureLabel: "Cuidado percebido em cada detalhe",
      colors: { primary: "#24483D", accent: "#D69A79", background: "#F5F1EA", surface: "#FFFCF7", text: "#17221F", muted: "#6D7974" },
    };
  }

  if (segmentIncludes(segment, ["loja", "supermerc", "farmácia", "óptica", "joalher", "papelaria", "material", "auto peças"])) {
    return {
      direction: "bold",
      heroLayout: "asymmetric",
      fontPair: "geometric",
      motion: "expressive",
      radius: "soft",
      signatureLabel: "Uma presença feita para ser lembrada",
      colors: { primary: "#152A4A", accent: "#F05A38", background: "#F5F6F8", surface: "#FFFFFF", text: "#101722", muted: "#657080" },
    };
  }

  return {
    direction: "minimal",
    heroLayout: "split",
    fontPair: "modern",
    motion: "standard",
    radius: "soft",
    signatureLabel: "Presença digital com identidade própria",
    colors: { primary: "#17324D", accent: "#D59B42", background: "#F3F1EC", surface: "#FFFFFF", text: "#14202A", muted: "#68737D" },
  };
}

function fallbackSpec(input) {
  const segment = input.segment || "negócio local";
  const city = input.city || "sua região";
  const design = fallbackDesign(input);
  return {
    brandName: input.name,
    audience: `Pessoas que procuram ${segment} em ${city}`,
    pageJob: "Gerar confiança imediata e conduzir o visitante ao contato",
    eyebrow: `${segment} em ${city}`,
    heroTitle: `${input.name}, apresentado com a força que o negócio merece`,
    heroText: input.editorialSummary || `Uma prévia criada para organizar as informações essenciais, transmitir confiança e facilitar o próximo contato com a ${input.name}.`,
    primaryCta: "Falar agora",
    secondaryCta: "Ver localização",
    aboutTitle: "Uma presença que traduz o negócio",
    aboutText: input.editorialSummary || `A ${input.name} ganha uma apresentação clara, responsiva e construída para valorizar sua atuação em ${city}, sem promessas genéricas nem informações inventadas.`,
    servicesTitle: "O que o cliente encontra aqui",
    servicesIntro: "Informação útil, hierarquia clara e um caminho de contato sem atrito.",
    services: [
      { title: "Atendimento direto", description: "Telefone, WhatsApp e localização organizados para o visitante agir sem procurar demais." },
      { title: "Presença local", description: `Uma comunicação alinhada ao contexto de ${city} e ao público que já busca este tipo de serviço.` },
      { title: "Decisão com confiança", description: "Conteúdo objetivo, prova disponível e experiência consistente no celular e no computador." },
    ],
    proofTitle: "Confiança antes do primeiro contato",
    proofText: input.rating ? `O negócio possui avaliação ${input.rating} no Google e ${input.reviews || 0} avaliações registradas.` : "A página reúne apenas dados verificáveis e conduz o visitante com clareza.",
    contactTitle: "O próximo passo precisa ser simples",
    contactText: "Entre em contato para confirmar atendimento, disponibilidade e demais informações.",
    seoTitle: `${input.name} | ${segment} em ${city}`,
    seoDescription: `Conheça a ${input.name}, ${segment} em ${city}. Veja informações, localização e formas de contato.`,
    design,
  };
}

function normalizeServices(value, fallback) {
  if (!Array.isArray(value)) return fallback;
  const services = value.slice(0, 5).map(item => ({ title: clean(item?.title, 90), description: clean(item?.description, 280) })).filter(item => item.title && item.description);
  return services.length >= 3 ? services : fallback;
}

function normalizeDesign(value, fallback) {
  const data = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    direction: DIRECTIONS.has(data.direction) ? data.direction : fallback.direction,
    heroLayout: HERO_LAYOUTS.has(data.heroLayout) ? data.heroLayout : fallback.heroLayout,
    fontPair: FONT_PAIRS.has(data.fontPair) ? data.fontPair : fallback.fontPair,
    motion: MOTION_LEVELS.has(data.motion) ? data.motion : fallback.motion,
    radius: RADIUS_LEVELS.has(data.radius) ? data.radius : fallback.radius,
    signatureLabel: clean(data.signatureLabel, 140) || fallback.signatureLabel,
    colors: {
      primary: safeColor(data.colors?.primary, fallback.colors.primary),
      accent: safeColor(data.colors?.accent, fallback.colors.accent),
      background: safeColor(data.colors?.background, fallback.colors.background),
      surface: safeColor(data.colors?.surface, fallback.colors.surface),
      text: safeColor(data.colors?.text, fallback.colors.text),
      muted: safeColor(data.colors?.muted, fallback.colors.muted),
    },
  };
}

function normalizeSpec(value, input) {
  const fallback = fallbackSpec(input);
  const data = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    brandName: clean(data.brandName, 120) || fallback.brandName,
    audience: clean(data.audience, 220) || fallback.audience,
    pageJob: clean(data.pageJob, 220) || fallback.pageJob,
    eyebrow: clean(data.eyebrow, 100) || fallback.eyebrow,
    heroTitle: clean(data.heroTitle, 190) || fallback.heroTitle,
    heroText: clean(data.heroText, 520) || fallback.heroText,
    primaryCta: clean(data.primaryCta, 60) || fallback.primaryCta,
    secondaryCta: clean(data.secondaryCta, 60) || fallback.secondaryCta,
    aboutTitle: clean(data.aboutTitle, 130) || fallback.aboutTitle,
    aboutText: clean(data.aboutText, 900) || fallback.aboutText,
    servicesTitle: clean(data.servicesTitle, 130) || fallback.servicesTitle,
    servicesIntro: clean(data.servicesIntro, 380) || fallback.servicesIntro,
    services: normalizeServices(data.services, fallback.services),
    proofTitle: clean(data.proofTitle, 130) || fallback.proofTitle,
    proofText: clean(data.proofText, 520) || fallback.proofText,
    contactTitle: clean(data.contactTitle, 130) || fallback.contactTitle,
    contactText: clean(data.contactText, 520) || fallback.contactText,
    seoTitle: clean(data.seoTitle, 70) || fallback.seoTitle,
    seoDescription: clean(data.seoDescription, 170) || fallback.seoDescription,
    design: normalizeDesign(data.design, fallback.design),
  };
}

function parseAiJson(text) {
  const raw = clean(text, 30000).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
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
  const photos = Array.isArray(place?.photos) ? place.photos.slice(0, 5) : [];
  if (!apiKey || !photos.length) return { images: [], attributions: [] };
  const imageDir = path.join(publicDir, "images");
  await fs.mkdir(imageDir, { recursive: true });
  const images = [];
  const attributions = [];

  for (let index = 0; index < photos.length; index++) {
    const photo = photos[index];
    if (!photo?.name) continue;
    try {
      const mediaResponse = await fetch(`https://places.googleapis.com/v1/${photo.name}/media?maxWidthPx=2200&skipHttpRedirect=true&key=${encodeURIComponent(apiKey)}`, { cache: "no-store" });
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
      "Você é diretor de criação, estrategista de conversão, redator e designer de produto digital.",
      "Aplique o mesmo rigor das skills /ui-ux-pro-max e /frontend-design: identidade específica ao assunto, hierarquia real, acessibilidade WCAG AA, mobile-first, tipografia deliberada, uma assinatura visual memorável e movimento com propósito.",
      "A landing será enviada como prévia comercial. Ela precisa causar a impressão de trabalho autoral de um estúdio de alto nível, não de template WordPress, tema PHP ou interface genérica criada por IA.",
      "Evite purple gradient genérico, excesso de cards arredondados, sombras pesadas, seções intercambiáveis, números decorativos sem significado, texto corporativo vazio e a combinação automática de fundo creme com serifada apenas por hábito.",
      "Escolha UMA direção estética coerente com o nicho, o público e o objetivo da página. Assuma um risco visual justificável em um único elemento de assinatura e mantenha o restante disciplinado.",
      "Planeje composição, paleta, tipografia e movimento antes de escrever. O hero deve funcionar como uma tese visual do negócio.",
      "As animações devem usar transform e opacity, respeitar prefers-reduced-motion e reforçar hierarquia, continuidade espacial ou feedback. Não anime por decorar.",
      "Use exclusivamente os fatos fornecidos. Não invente serviços, preços, promoções, resultados, prêmios, depoimentos, tempo de mercado, certificações ou diferenciais não comprovados.",
      "Escreva em português do Brasil, em voz ativa, sem emojis, hashtags ou clichês.",
      "Retorne apenas um objeto JSON válido, sem markdown, comentários ou texto fora do JSON.",
    ].join(" "),
    prompt: [
      "Crie a direção completa de conteúdo e design para uma landing page comercial premium.",
      "A página será implementada em Next.js 15 + React 19, com Framer Motion para entrada e microinterações e GSAP ScrollTrigger para revelações de scroll.",
      "Escolha valores somente entre os enums informados e mantenha contraste suficiente.",
      "O rodapé será assinado como: Prévia desenvolvida por Saulo Pavanello.",
      "Formato obrigatório:",
      JSON.stringify({
        brandName: "", audience: "", pageJob: "", eyebrow: "", heroTitle: "", heroText: "", primaryCta: "", secondaryCta: "",
        aboutTitle: "", aboutText: "", servicesTitle: "", servicesIntro: "",
        services: [{ title: "", description: "" }, { title: "", description: "" }, { title: "", description: "" }],
        proofTitle: "", proofText: "", contactTitle: "", contactText: "", seoTitle: "", seoDescription: "",
        design: {
          direction: "editorial | cinematic | precision | organic | bold | minimal",
          heroLayout: "split | immersive | asymmetric",
          fontPair: "editorial | modern | geometric | humanist | luxury",
          motion: "subtle | standard | expressive",
          radius: "sharp | soft | rounded",
          signatureLabel: "",
          colors: { primary: "#000000", accent: "#000000", background: "#000000", surface: "#000000", text: "#000000", muted: "#000000" },
        },
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

function fontSource(pair) {
  const configs = {
    editorial: { imports: "Cormorant_Garamond, Manrope", display: 'const display = Cormorant_Garamond({ subsets: ["latin"], variable: "--font-display", weight: ["500", "600", "700"] });', body: 'const body = Manrope({ subsets: ["latin"], variable: "--font-body" });' },
    modern: { imports: "Space_Grotesk, DM_Sans", display: 'const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display" });', body: 'const body = DM_Sans({ subsets: ["latin"], variable: "--font-body" });' },
    geometric: { imports: "Space_Grotesk, Manrope", display: 'const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display" });', body: 'const body = Manrope({ subsets: ["latin"], variable: "--font-body" });' },
    humanist: { imports: "Fraunces, DM_Sans", display: 'const display = Fraunces({ subsets: ["latin"], variable: "--font-display" });', body: 'const body = DM_Sans({ subsets: ["latin"], variable: "--font-body" });' },
    luxury: { imports: "Cormorant_Garamond, DM_Sans", display: 'const display = Cormorant_Garamond({ subsets: ["latin"], variable: "--font-display", weight: ["500", "600", "700"] });', body: 'const body = DM_Sans({ subsets: ["latin"], variable: "--font-body" });' },
  };
  return configs[pair] || configs.modern;
}

function pageSource(data) {
  return `"use client";

import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";

const site = ${JSON.stringify(data, null, 2)};

function Icon({ name }) {
  const paths = {
    arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
    phone: <><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.8a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.84.57 2.8.7A2 2 0 0 1 22 16.92Z"/></>,
    pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    spark: <><path d="m12 3 1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name] || paths.check}</svg>;
}

function ActionLink({ href, children, className = "", icon = "arrow" }) {
  if (!href) return null;
  const external = href.startsWith("http");
  return <a className={className} href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined}><span>{children}</span><Icon name={icon}/></a>;
}

export default function Home() {
  const rootRef = useRef(null);
  const reducedMotion = useReducedMotion();
  const phoneHref = site.phone ? "tel:" + site.phone.replace(/[^+\\d]/g, "") : "";
  const whatsappHref = site.whatsapp ? "https://wa.me/" + site.whatsapp : "";
  const primaryHref = whatsappHref || phoneHref || site.mapsLink || "#contato";
  const motionDistance = site.design.motion === "expressive" ? 40 : site.design.motion === "subtle" ? 14 : 26;

  useEffect(() => {
    if (reducedMotion || !rootRef.current) return undefined;
    let context;
    let active = true;
    Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(([gsapModule, triggerModule]) => {
      if (!active || !rootRef.current) return;
      const gsap = gsapModule.gsap;
      const ScrollTrigger = triggerModule.ScrollTrigger;
      gsap.registerPlugin(ScrollTrigger);
      context = gsap.context(() => {
        gsap.utils.toArray("[data-reveal]").forEach(element => {
          gsap.fromTo(element, { y: motionDistance, opacity: 0 }, { y: 0, opacity: 1, duration: site.design.motion === "subtle" ? 0.55 : 0.85, ease: "power3.out", scrollTrigger: { trigger: element, start: "top 84%", once: true } });
        });
        gsap.utils.toArray("[data-parallax]").forEach(element => {
          gsap.to(element, { yPercent: -8, ease: "none", scrollTrigger: { trigger: element, start: "top bottom", end: "bottom top", scrub: 0.8 } });
        });
      }, rootRef);
    });
    return () => { active = false; if (context) context.revert(); };
  }, [reducedMotion, motionDistance]);

  const heroInitial = reducedMotion ? false : { opacity: 0, y: motionDistance };
  const heroTransition = { duration: site.design.motion === "subtle" ? 0.45 : 0.8, ease: [0.22, 1, 0.36, 1] };

  return <main ref={rootRef} data-direction={site.design.direction} data-layout={site.design.heroLayout} data-radius={site.design.radius} data-motion={site.design.motion}>
    <header className="siteHeader"><a className="brand" href="#top" aria-label={"Ir ao início de " + site.brandName}>{site.brandName}</a><nav aria-label="Navegação principal"><a href="#sobre">Sobre</a><a href="#servicos">Diferenciais</a><a href="#contato">Contato</a></nav><ActionLink href={primaryHref} className="headerCta">{site.primaryCta}</ActionLink></header>

    <section className="hero" id="top"><div className="heroAtmosphere" aria-hidden="true"/>
      <motion.div className="heroCopy" initial={heroInitial} animate={{ opacity: 1, y: 0 }} transition={heroTransition}><span className="eyebrow"><Icon name="spark"/>{site.eyebrow}</span><h1>{site.heroTitle}</h1><p>{site.heroText}</p><div className="heroActions"><ActionLink href={primaryHref} className="primary">{site.primaryCta}</ActionLink>{site.mapsLink && <ActionLink href={site.mapsLink} className="secondary" icon="pin">{site.secondaryCta}</ActionLink>}</div><div className="trustLine" aria-label="Informações de confiança">{site.rating && <div><strong>{site.rating}</strong><span>avaliação no Google</span></div>}{site.reviews && <div><strong>{site.reviews}</strong><span>avaliações registradas</span></div>}{site.city && <div><strong>{site.city}</strong><span>atendimento local</span></div>}</div></motion.div>
      <motion.div className="heroVisual" initial={reducedMotion ? false : { opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...heroTransition, delay: 0.14 }}><div className="signatureRail"><span>{site.design.signatureLabel}</span></div><div className="heroImage" data-parallax>{site.images[0] ? <img src={site.images[0]} alt={"Ambiente ou apresentação de " + site.brandName}/> : <div className="mediaFallback"><span>{site.brandName.slice(0, 1)}</span><small>{site.segment || "Negócio local"}</small></div>}</div><div className="heroNote"><span>Prévia estratégica</span><strong>{site.pageJob}</strong></div>{site.images[1] && <div className="heroImageSecondary"><img src={site.images[1]} alt={"Detalhe de " + site.brandName}/></div>}</motion.div>
    </section>

    <section className="statement" id="sobre" data-reveal><div><span className="sectionLabel">Direção</span><h2>{site.aboutTitle}</h2></div><div className="statementBody"><p>{site.aboutText}</p><span className="audience">Criado para: {site.audience}</span></div></section>

    <section className="services" id="servicos"><div className="sectionHead" data-reveal><div><span className="sectionLabel">Experiência</span><h2>{site.servicesTitle}</h2></div><p>{site.servicesIntro}</p></div><div className="serviceComposition">{site.services.map((service, index) => <article className={"serviceCard serviceCard-" + index} key={service.title} data-reveal><span className="serviceMarker" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><div className="serviceIcon"><Icon name={index === 0 ? "spark" : "check"}/></div><h3>{service.title}</h3><p>{service.description}</p></article>)}</div></section>

    {site.images.length > 2 && <section className="gallery" aria-label={"Galeria de " + site.brandName}>{site.images.slice(2, 5).map((image, index) => <figure key={image} data-reveal><img src={image} alt={"Imagem " + (index + 1) + " de " + site.brandName}/></figure>)}</section>}

    <section className="proof" data-reveal><div className="proofCopy"><span className="sectionLabel">Confiança</span><h2>{site.proofTitle}</h2><p>{site.proofText}</p></div><div className="proofPanel">{site.address && <div><Icon name="pin"/><span><small>Endereço</small><strong>{site.address}</strong></span></div>}{site.hours.length > 0 && <div><Icon name="clock"/><span><small>Horários informados</small><strong>{site.hours.slice(0, 2).join(" · ")}</strong></span></div>}{site.phone && <div><Icon name="phone"/><span><small>Contato</small><strong>{site.phone}</strong></span></div>}</div></section>

    <section className="contact" id="contato" data-reveal><div><span className="sectionLabel">Próximo passo</span><h2>{site.contactTitle}</h2><p>{site.contactText}</p></div><div className="contactActions"><ActionLink href={primaryHref} className="contactPrimary">{site.primaryCta}</ActionLink>{site.mapsLink && <ActionLink href={site.mapsLink} className="contactSecondary" icon="pin">Abrir no Google Maps</ActionLink>}</div></section>

    <footer><div><strong>{site.brandName}</strong><span>{site.segment}{site.city ? " · " + site.city : ""}</span></div><p>Prévia desenvolvida por Saulo Pavanello</p></footer>
    {site.attributions.length > 0 && <div className="attributions">Fotos: {site.attributions.map((item, index) => <span key={item.name}>{index > 0 ? " · " : ""}{item.uri ? <a href={item.uri} target="_blank" rel="noreferrer">{item.name}</a> : item.name}</span>)}</div>}
    {whatsappHref && <motion.a className="floatingWhatsapp" href={whatsappHref} target="_blank" rel="noreferrer" aria-label="Conversar pelo WhatsApp" whileHover={reducedMotion ? undefined : { y: -3 }} whileTap={reducedMotion ? undefined : { scale: 0.96 }}><Icon name="phone"/><span>WhatsApp</span></motion.a>}
  </main>;
}
`;
}

function layoutSource(data) {
  const font = fontSource(data.design.fontPair);
  return `import "./globals.css";
import { ${font.imports} } from "next/font/google";

${font.display}
${font.body}

export const metadata = { title: ${JSON.stringify(data.seoTitle)}, description: ${JSON.stringify(data.seoDescription)} };

export default function RootLayout({ children }) {
  return <html lang="pt-BR" className={display.variable + " " + body.variable}><body>{children}</body></html>;
}
`;
}

function cssSource(design) {
  const radius = design.radius === "sharp" ? "2px" : design.radius === "rounded" ? "28px" : "14px";
  return `:root{--primary:${design.colors.primary};--accent:${design.colors.accent};--background:${design.colors.background};--surface:${design.colors.surface};--text:${design.colors.text};--muted:${design.colors.muted};--line:color-mix(in srgb,var(--text) 14%,transparent);--radius:${radius};--shadow:0 24px 80px color-mix(in srgb,var(--text) 12%,transparent);--max:1440px}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--background);color:var(--text);font-family:var(--font-body),sans-serif;font-size:16px;line-height:1.6}body,button,a{font-family:var(--font-body),sans-serif}a{color:inherit}img{display:block;max-width:100%}svg{width:20px;height:20px;flex:0 0 auto}:focus-visible{outline:3px solid color-mix(in srgb,var(--accent) 72%,white);outline-offset:4px}main{min-height:100vh;overflow:hidden}.siteHeader{position:sticky;top:0;z-index:50;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:24px;max-width:var(--max);margin:0 auto;padding:18px clamp(20px,5vw,72px);background:color-mix(in srgb,var(--background) 88%,transparent);backdrop-filter:blur(18px);border-bottom:1px solid var(--line)}.brand{font-family:var(--font-display),sans-serif;font-weight:750;font-size:clamp(18px,2vw,24px);letter-spacing:-.04em;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.siteHeader nav{display:flex;align-items:center;gap:28px}.siteHeader nav a{font-size:13px;text-decoration:none;color:var(--muted);transition:color .2s ease}.siteHeader nav a:hover{color:var(--text)}.headerCta,.primary,.secondary,.contactPrimary,.contactSecondary{min-height:46px;display:inline-flex;align-items:center;justify-content:center;gap:10px;padding:12px 18px;border:1px solid transparent;border-radius:var(--radius);text-decoration:none;font-size:13px;font-weight:800;transition:transform .2s ease,background-color .2s ease,border-color .2s ease,color .2s ease}.headerCta{justify-self:end;background:var(--primary);color:#fff}.headerCta:hover,.primary:hover,.contactPrimary:hover{transform:translateY(-2px)}.hero{position:relative;max-width:var(--max);margin:0 auto;min-height:760px;display:grid;grid-template-columns:minmax(0,1.05fr) minmax(380px,.95fr);align-items:center;gap:clamp(40px,7vw,110px);padding:clamp(64px,8vw,120px) clamp(20px,6vw,92px)}.heroAtmosphere{position:absolute;inset:8% -20% auto 42%;height:520px;background:radial-gradient(circle at center,color-mix(in srgb,var(--accent) 24%,transparent),transparent 68%);filter:blur(24px);pointer-events:none}.heroCopy{position:relative;z-index:2}.eyebrow,.sectionLabel{display:inline-flex;align-items:center;gap:9px;margin-bottom:22px;color:var(--primary);font-size:11px;font-weight:850;letter-spacing:.14em;text-transform:uppercase}.hero h1,.statement h2,.sectionHead h2,.proof h2,.contact h2{font-family:var(--font-display),sans-serif;letter-spacing:-.055em;line-height:.94;text-wrap:balance}.hero h1{max-width:900px;margin:0;font-size:clamp(54px,7.4vw,112px)}.heroCopy>p{max-width:690px;margin:30px 0;color:var(--muted);font-size:clamp(17px,1.5vw,21px);line-height:1.65}.heroActions{display:flex;gap:12px;flex-wrap:wrap}.primary,.contactPrimary{background:var(--primary);color:#fff}.secondary,.contactSecondary{border-color:var(--line);background:color-mix(in srgb,var(--surface) 75%,transparent);color:var(--text)}.trustLine{display:flex;gap:34px;flex-wrap:wrap;margin-top:44px;padding-top:24px;border-top:1px solid var(--line)}.trustLine div{display:flex;flex-direction:column;gap:2px}.trustLine strong{font-family:var(--font-display),sans-serif;font-size:22px;line-height:1}.trustLine span{color:var(--muted);font-size:11px}.heroVisual{position:relative;min-height:620px}.heroImage{position:absolute;inset:0 0 46px 34px;overflow:hidden;border-radius:calc(var(--radius) * 1.4);background:var(--primary);box-shadow:var(--shadow)}.heroImage img{width:100%;height:100%;object-fit:cover}.heroImage:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 50%,color-mix(in srgb,var(--text) 36%,transparent))}.mediaFallback{width:100%;height:100%;display:grid;place-items:center;align-content:center;gap:8px;color:#fff;background:linear-gradient(145deg,var(--primary),color-mix(in srgb,var(--primary) 72%,var(--accent)))}.mediaFallback span{font-family:var(--font-display),sans-serif;font-size:clamp(120px,18vw,260px);line-height:.75}.mediaFallback small{font-size:11px;letter-spacing:.16em;text-transform:uppercase}.signatureRail{position:absolute;z-index:5;top:24px;left:0;bottom:90px;width:68px;display:flex;align-items:flex-end;justify-content:center;background:var(--accent);color:var(--text);border-radius:var(--radius)}.signatureRail span{writing-mode:vertical-rl;transform:rotate(180deg);padding:18px 0;font-size:10px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.heroNote{position:absolute;z-index:6;right:-22px;bottom:0;width:min(360px,76%);padding:22px 24px;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);display:flex;flex-direction:column;gap:6px}.heroNote span{color:var(--primary);font-size:10px;font-weight:900;letter-spacing:.13em;text-transform:uppercase}.heroNote strong{font-size:15px;line-height:1.45}.heroImageSecondary{position:absolute;z-index:4;right:-28px;top:-28px;width:150px;height:190px;padding:7px;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow)}.heroImageSecondary img{width:100%;height:100%;object-fit:cover;border-radius:calc(var(--radius) * .65)}.statement{max-width:var(--max);margin:0 auto;display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:clamp(44px,8vw,130px);padding:clamp(88px,10vw,150px) clamp(20px,6vw,92px);background:var(--primary);color:#fff}.statement .sectionLabel{color:var(--accent)}.statement h2,.sectionHead h2,.proof h2,.contact h2{margin:0;font-size:clamp(42px,5vw,78px)}.statementBody p{margin:28px 0 26px;color:color-mix(in srgb,#fff 78%,transparent);font-size:clamp(17px,1.6vw,22px)}.audience{display:block;padding-top:20px;border-top:1px solid color-mix(in srgb,#fff 22%,transparent);font-size:12px;color:color-mix(in srgb,#fff 66%,transparent)}.services{max-width:var(--max);margin:0 auto;padding:clamp(88px,10vw,150px) clamp(20px,6vw,92px)}.sectionHead{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,.55fr);gap:50px;align-items:end;margin-bottom:56px}.sectionHead>p{margin:0;color:var(--muted);font-size:17px}.serviceComposition{display:grid;grid-template-columns:1.2fr .8fr;grid-auto-rows:minmax(210px,auto);gap:14px}.serviceCard{position:relative;min-height:250px;padding:34px;border:1px solid var(--line);border-radius:var(--radius);background:var(--surface);overflow:hidden;transition:transform .25s ease,border-color .25s ease}.serviceCard:hover{transform:translateY(-4px);border-color:color-mix(in srgb,var(--primary) 45%,var(--line))}.serviceCard-0{grid-row:span 2;min-height:514px;background:var(--accent)}.serviceCard-0 h3{font-size:clamp(34px,4vw,58px)}.serviceMarker{position:absolute;right:24px;top:20px;color:color-mix(in srgb,var(--text) 42%,transparent);font-size:10px;letter-spacing:.14em}.serviceIcon{width:46px;height:46px;display:grid;place-items:center;border-radius:50%;background:color-mix(in srgb,var(--primary) 10%,transparent);color:var(--primary)}.serviceCard h3{max-width:420px;margin:clamp(54px,7vw,110px) 0 14px;font-family:var(--font-display),sans-serif;font-size:clamp(25px,2.7vw,39px);line-height:1;letter-spacing:-.04em}.serviceCard p{max-width:520px;margin:0;color:color-mix(in srgb,var(--text) 68%,transparent)}.gallery{max-width:var(--max);margin:0 auto;display:grid;grid-template-columns:1.2fr .8fr;gap:14px;padding:0 clamp(20px,6vw,92px) clamp(88px,10vw,150px)}.gallery figure{margin:0;min-height:520px;overflow:hidden;border-radius:var(--radius)}.gallery figure:nth-child(n+3){grid-column:span 2;min-height:360px}.gallery img{width:100%;height:100%;object-fit:cover;transition:transform .6s cubic-bezier(.22,1,.36,1)}.gallery figure:hover img{transform:scale(1.025)}.proof{max-width:var(--max);margin:0 auto;display:grid;grid-template-columns:minmax(0,1fr) minmax(360px,.75fr);gap:clamp(50px,8vw,130px);padding:clamp(88px,10vw,150px) clamp(20px,6vw,92px);background:var(--surface)}.proofCopy>p{max-width:650px;margin:26px 0 0;color:var(--muted);font-size:18px}.proofPanel{border-top:1px solid var(--line)}.proofPanel>div{display:flex;align-items:flex-start;gap:16px;padding:24px 0;border-bottom:1px solid var(--line)}.proofPanel svg{margin-top:2px;color:var(--primary)}.proofPanel span{display:flex;flex-direction:column;gap:5px}.proofPanel small{color:var(--muted);font-size:10px;letter-spacing:.12em;text-transform:uppercase}.proofPanel strong{font-size:14px;line-height:1.45}.contact{max-width:var(--max);margin:0 auto;display:grid;grid-template-columns:minmax(0,1fr) minmax(360px,.65fr);gap:clamp(50px,8vw,130px);padding:clamp(88px,10vw,150px) clamp(20px,6vw,92px);background:var(--accent)}.contact>div:first-child>p{max-width:620px;margin:26px 0 0;font-size:18px}.contactActions{display:flex;flex-direction:column;justify-content:center;gap:12px}.contactPrimary,.contactSecondary{width:100%;min-height:58px;justify-content:space-between;padding:16px 20px}.contactSecondary{border-color:color-mix(in srgb,var(--text) 28%,transparent);background:transparent}footer{max-width:var(--max);margin:0 auto;display:flex;justify-content:space-between;gap:30px;padding:36px clamp(20px,6vw,92px);background:var(--text);color:#fff}footer>div{display:flex;flex-direction:column;gap:3px}footer span,footer p{margin:0;color:color-mix(in srgb,#fff 62%,transparent);font-size:11px}.attributions{max-width:var(--max);margin:0 auto;padding:8px clamp(20px,6vw,92px);background:var(--text);color:color-mix(in srgb,#fff 48%,transparent);font-size:8px}.attributions a{color:inherit}.floatingWhatsapp{position:fixed;z-index:60;right:22px;bottom:22px;min-height:50px;display:inline-flex;align-items:center;gap:9px;padding:13px 17px;background:#0B7A4B;color:#fff;border-radius:999px;text-decoration:none;font-size:12px;font-weight:850;box-shadow:0 15px 45px rgba(11,122,75,.25)}main[data-layout="immersive"] .hero{grid-template-columns:1fr;min-height:880px}main[data-layout="immersive"] .heroCopy{max-width:980px;z-index:5}main[data-layout="immersive"] .heroVisual{position:absolute;inset:36px clamp(20px,6vw,92px);z-index:1}main[data-layout="immersive"] .heroImage{inset:0;opacity:.42}main[data-layout="immersive"] .heroImage:after{background:linear-gradient(90deg,var(--background) 8%,color-mix(in srgb,var(--background) 82%,transparent) 52%,transparent)}main[data-layout="immersive"] .heroNote{right:0;bottom:24px}main[data-layout="immersive"] .signatureRail{left:auto;right:0;top:0;bottom:auto;height:220px}main[data-layout="immersive"] .trustLine{max-width:720px}main[data-layout="asymmetric"] .hero{grid-template-columns:minmax(0,.82fr) minmax(440px,1.18fr)}main[data-direction="precision"]{--shadow:0 20px 60px color-mix(in srgb,var(--text) 8%,transparent)}main[data-direction="precision"] .heroImage,main[data-direction="precision"] .serviceCard,main[data-direction="precision"] .heroNote{box-shadow:none}main[data-direction="editorial"] .hero h1,main[data-direction="cinematic"] .hero h1{font-weight:600}main[data-direction="bold"] .hero h1{text-transform:uppercase;line-height:.86}main[data-radius="sharp"] .serviceIcon{border-radius:2px}@media(max-width:1000px){.siteHeader{grid-template-columns:1fr auto}.siteHeader nav{display:none}.hero,.statement,.proof,.contact{grid-template-columns:1fr}.hero{min-height:auto}.heroVisual{min-height:560px}main[data-layout="immersive"] .hero{min-height:820px}main[data-layout="immersive"] .heroVisual{inset:24px}.sectionHead{grid-template-columns:1fr}.serviceComposition{grid-template-columns:1fr 1fr}.serviceCard-0{grid-row:auto;grid-column:span 2;min-height:360px}.gallery{grid-template-columns:1fr 1fr}}@media(max-width:680px){.siteHeader{padding:14px 18px}.headerCta span{display:none}.headerCta{width:46px;padding:0}.hero,.statement,.services,.proof,.contact{padding-left:18px;padding-right:18px}.hero{padding-top:62px;padding-bottom:82px;gap:44px}.hero h1{font-size:clamp(46px,14vw,68px)}.heroVisual{min-height:450px}.heroImage{inset:0 0 34px 20px}.signatureRail{width:48px}.heroNote{right:0;width:86%}.heroImageSecondary{display:none}main[data-layout="immersive"] .hero{min-height:760px;padding-top:94px}main[data-layout="immersive"] .heroVisual{inset:12px}.trustLine{gap:20px}.statement h2,.sectionHead h2,.proof h2,.contact h2{font-size:clamp(38px,12vw,58px)}.serviceComposition{grid-template-columns:1fr}.serviceCard-0{grid-column:auto;min-height:320px}.serviceCard{min-height:260px}.gallery{grid-template-columns:1fr;padding-left:18px;padding-right:18px}.gallery figure,.gallery figure:nth-child(n+3){grid-column:auto;min-height:330px}footer{flex-direction:column;padding:30px 18px}.floatingWhatsapp span{display:none}.floatingWhatsapp{width:52px;height:52px;padding:0;justify-content:center}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*:before,*:after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}`;
}

function refinementPrompt(data) {
  return `# Refinamento opcional no Claude Code

Este projeto já incorpora no gerador os princípios centrais das skills **/ui-ux-pro-max** e **/frontend-design**.

Ao abrir esta pasta no Claude Code, execute:

\`\`\`text
/ui-ux-pro-max
/frontend-design
\`\`\`

Depois use este pedido:

\`\`\`text
Revise esta landing page como diretor de criação e engenheiro front-end sênior.

Negócio: ${data.brandName}
Público: ${data.audience}
Objetivo único: ${data.pageJob}
Direção escolhida: ${data.design.direction}
Assinatura visual: ${data.design.signatureLabel}

Preserve apenas informações verificáveis. Não invente serviços, resultados, preços ou depoimentos.
Aprimore composição, tipografia, imagens, responsividade, acessibilidade WCAG AA e movimento com propósito.
Evite aparência de template, estética genérica de IA, excesso de cards, gradientes gratuitos e animações decorativas.
Mantenha Framer Motion para entrada e microinterações e GSAP ScrollTrigger para movimento de scroll.
Antes de entregar, valide 320px, 768px, 1024px e 1440px, foco por teclado e prefers-reduced-motion.
\`\`\`
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
    aiWarning = `A IA não concluiu a direção criativa: ${error.message}. Foi aplicado um sistema visual profissional específico para o nicho.`;
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
    version: "2.0.0",
    private: true,
    scripts: { dev: "next dev", build: "next build", start: "next start" },
    dependencies: { next: "15.1.6", react: "19.0.0", "react-dom": "19.0.0", "framer-motion": "^12.0.0", gsap: "^3.12.5" },
  };

  const report = {
    generatedAt: new Date().toISOString(),
    generatorVersion: 2,
    aiUsed,
    aiWarning,
    source: place ? "Google Places + CRM" : "CRM ou descrição",
    design: siteData.design,
    audience: siteData.audience,
    pageJob: siteData.pageJob,
    photoAttributions: media.attributions,
    validationRequired: true,
  };

  await Promise.all([
    fs.writeFile(path.join(folder.absolutePath, "package.json"), JSON.stringify(packageJson, null, 2), "utf8"),
    fs.writeFile(path.join(folder.absolutePath, ".gitignore"), "node_modules\n.next\n.env*\n", "utf8"),
    fs.writeFile(path.join(folder.absolutePath, "app", "layout.js"), layoutSource(siteData), "utf8"),
    fs.writeFile(path.join(folder.absolutePath, "app", "page.js"), pageSource(siteData), "utf8"),
    fs.writeFile(path.join(folder.absolutePath, "app", "globals.css"), cssSource(siteData.design), "utf8"),
    fs.writeFile(path.join(folder.absolutePath, "generation-report.json"), JSON.stringify(report, null, 2), "utf8"),
    fs.writeFile(path.join(folder.absolutePath, "CLAUDE-REFINEMENT.md"), refinementPrompt(siteData), "utf8"),
    fs.writeFile(path.join(folder.absolutePath, "README.md"), `# ${placeData.name}\n\nLanding page premium gerada pelo LeadFlow.\n\n## Executar\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n\nAbra http://localhost:3000.\n\n## Stack visual\n\n- Next.js 15 + React 19\n- Framer Motion para entrada e microinterações\n- GSAP ScrollTrigger para movimento de scroll\n- Tipografia via next/font\n- Direção visual específica para o nicho\n- prefers-reduced-motion e foco por teclado\n\n## Validação obrigatória\n\n- Revise textos, telefones, horários e serviços antes do deploy.\n- Confirme com o cliente o direito de uso das imagens.\n- Mantenha as atribuições das fotos quando existirem.\n- Teste em 320px, 768px, 1024px e 1440px.\n- A assinatura \"Prévia desenvolvida por Saulo Pavanello\" já está aplicada.\n- Consulte CLAUDE-REFINEMENT.md para uma segunda passada com /ui-ux-pro-max e /frontend-design.\n`, "utf8"),
  ]);

  return { folderName: folder.folderName, folderPath: path.relative(process.cwd(), folder.absolutePath).replace(/\\/g, "/"), aiUsed, warning: aiWarning, imageCount: media.images.length, designDirection: siteData.design.direction };
}
