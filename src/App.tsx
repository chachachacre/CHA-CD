import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  FileDown,
  Mail,
  Phone,
  Instagram,
  Linkedin,
  MapPin,
  Play,
  Lock,
  ArrowUpRight,
  Sparkles,
  ExternalLink
} from "lucide-react";
import { PortfolioItem, ContactInfo, PortfolioSettings } from "./types";
import {
  initialPortfolioItems,
  initialContactInfo,
  initialPortfolioSettings
} from "./data";
import VideoModal from "./components/VideoModal";
import AdminPanel from "./components/AdminPanel";
import { getPDF, useMediaUrl } from "./pdfStorage";
import { ResolvedImage } from "./components/ResolvedImage";
import { db, syncAllPortfolioItemsToFirestore, saveContactInfoToFirestore, savePortfolioSettingsToFirestore } from "./firebase";
import { collection, doc, onSnapshot, setDoc, query, orderBy, writeBatch } from "firebase/firestore";

export default function App() {
  // State management with localStorage fallback (for instant initial paint)
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>(() => {
    const saved = localStorage.getItem("cha_portfolio_items");
    return saved ? JSON.parse(saved) : initialPortfolioItems;
  });

  const [contactInfo, setContactInfo] = useState<ContactInfo>(() => {
    const saved = localStorage.getItem("cha_contact_info");
    return saved ? JSON.parse(saved) : initialContactInfo;
  });

  const [portfolioSettings, setPortfolioSettings] = useState<PortfolioSettings>(() => {
    const saved = localStorage.getItem("cha_portfolio_settings");
    return saved ? JSON.parse(saved) : initialPortfolioSettings;
  });

  const [selectedVideo, setSelectedVideo] = useState<PortfolioItem | null>(null);
  const [isAdminOpen, setIsAdminOpen] = useState(false);

  // Real-time Firestore synchronization & Auto-seeding with migration
  useEffect(() => {
    console.log("Initializing Firestore real-time listeners...");
    const qItems = query(collection(db, "portfolio_items"), orderBy("order"));
    const unsubscribeItems = onSnapshot(
      qItems,
      async (snapshot) => {
        console.log("Firestore portfolio_items snapshot received. Empty:", snapshot.empty);
        if (snapshot.empty) {
          // Seed Firestore using existing localStorage or default data
          const localSaved = localStorage.getItem("cha_portfolio_items");
          const itemsToSeed = localSaved ? JSON.parse(localSaved) : initialPortfolioItems;
          const batch = writeBatch(db);
          itemsToSeed.forEach((item: PortfolioItem) => {
            batch.set(doc(db, "portfolio_items", item.id), item);
          });
          await batch.commit();
          console.log("Firestore successfully seeded with default items.");
        } else {
          const items: PortfolioItem[] = [];
          snapshot.forEach((docSnap) => {
            items.push(docSnap.data() as PortfolioItem);
          });
          setPortfolioItems(items);
          localStorage.setItem("cha_portfolio_items", JSON.stringify(items));
        }
      },
      (error) => {
        console.error("Firestore onSnapshot error (portfolio_items):", error);
      }
    );

    const unsubscribeContact = onSnapshot(
      doc(db, "configs", "contact"),
      async (docSnap) => {
        console.log("Firestore configs/contact snapshot received. Exists:", docSnap.exists());
        if (!docSnap.exists()) {
          const localSaved = localStorage.getItem("cha_contact_info");
          const contactToSeed = localSaved ? JSON.parse(localSaved) : initialContactInfo;
          await setDoc(doc(db, "configs", "contact"), contactToSeed);
          console.log("Firestore configs/contact successfully seeded.");
        } else {
          const contact = docSnap.data() as ContactInfo;
          setContactInfo(contact);
          localStorage.setItem("cha_contact_info", JSON.stringify(contact));
        }
      },
      (error) => {
        console.error("Firestore onSnapshot error (configs/contact):", error);
      }
    );

    const unsubscribeSettings = onSnapshot(
      doc(db, "configs", "settings"),
      async (docSnap) => {
        console.log("Firestore configs/settings snapshot received. Exists:", docSnap.exists());
        if (!docSnap.exists()) {
          const localSaved = localStorage.getItem("cha_portfolio_settings");
          const settingsToSeed = localSaved ? JSON.parse(localSaved) : initialPortfolioSettings;
          await setDoc(doc(db, "configs", "settings"), settingsToSeed);
          console.log("Firestore configs/settings successfully seeded.");
        } else {
          const settings = docSnap.data() as PortfolioSettings;
          setPortfolioSettings(settings);
          localStorage.setItem("cha_portfolio_settings", JSON.stringify(settings));
        }
      },
      (error) => {
        console.error("Firestore onSnapshot error (configs/settings):", error);
      }
    );

    return () => {
      unsubscribeItems();
      unsubscribeContact();
      unsubscribeSettings();
    };
  }, []);

  const [localPdfUrl, setLocalPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let url: string | null = null;

    const loadPdfFile = async () => {
      try {
        const file = await getPDF();
        if (active) {
          if (file) {
            url = URL.createObjectURL(file);
            setLocalPdfUrl(url);
          } else {
            setLocalPdfUrl(null);
          }
        }
      } catch (err) {
        console.error("Error loading PDF", err);
      }
    };

    loadPdfFile();

    return () => {
      active = false;
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [portfolioSettings]);

  // Scroll handler for smooth navigation
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const offset = 90; // offset for sticky header
      const bodyRect = document.body.getBoundingClientRect().top;
      const elementRect = element.getBoundingClientRect().top;
      const elementPosition = elementRect - bodyRect;
      const offsetPosition = elementPosition - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth"
      });
    }
  };

  return (
    <div className="min-h-screen bg-white text-neutral-900 selection:bg-neutral-900 selection:text-white flex flex-col justify-between">
      {/* 1. Header (Sticky Top with only PORTFOLIO and CONTACT links) */}
      <header className="sticky top-0 left-0 right-0 bg-white/80 backdrop-blur-md z-40 border-b border-neutral-100 transition-all duration-300">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-4 flex items-center justify-end">
          {/* Navigation Links - Exactly PORTFOLIO and CONTACT as requested */}
          <nav className="flex items-center gap-6 md:gap-8" id="primary-navigation">
            <button
              onClick={() => scrollToSection("portfolio-section")}
              className="text-xs font-bold tracking-widest text-neutral-900 hover:underline decoration-2 underline-offset-8 transition-all uppercase py-1 cursor-pointer"
              id="nav-portfolio"
            >
              Portfolio
            </button>
            <button
              onClick={() => scrollToSection("contact-section")}
              className="text-xs font-bold tracking-widest text-neutral-900 hover:underline decoration-2 underline-offset-8 transition-all uppercase py-1 cursor-pointer"
              id="nav-contact"
            >
              Contact
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content Areas */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 md:px-8 pt-10 pb-20">
        
        {/* Intro Branding Header (Swiss-style high contrast) */}
        <section className="mb-14 space-y-3">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-4"
          >
            <h1 className="text-4xl md:text-6xl font-black font-display tracking-tight text-neutral-950 leading-tight">
              CHA CD
            </h1>
            <div className="text-xs md:text-sm text-neutral-950 font-light max-w-2xl leading-relaxed tracking-tight space-y-1.5">
              {portfolioSettings.introduction &&
                portfolioSettings.introduction.split(/(?<=[.!?])\s+/).map((sentence, index) => (
                  <span key={index} className="block">
                    {sentence}
                  </span>
                ))}
            </div>
          </motion.div>
        </section>

        {/* 2. Featured Works Section (Instagram-style 3-Column Grid) */}
        <section className="space-y-6" id="works-section">
          <div className="flex items-baseline justify-between border-b border-neutral-100 pb-3">
            <h2 className="text-xs font-bold font-mono tracking-widest text-neutral-400 uppercase">
              Featured Works ({portfolioItems.length})
            </h2>
            <span className="text-[10px] text-neutral-400 font-mono hidden sm:inline">
              ※ 클릭하여 고해상도 영상을 감상하세요
            </span>
          </div>

          {/* Instagram-style 3-column Grid */}
          {portfolioItems.length === 0 ? (
            <div className="text-center py-20 bg-neutral-50 border border-neutral-100">
              <p className="text-xs uppercase tracking-widest text-neutral-400 font-bold mb-2">등록된 포트폴리오 작업물이 없습니다.</p>
              <button
                onClick={() => setIsAdminOpen(true)}
                className="text-xs bg-black hover:bg-neutral-900 text-white px-5 py-3 tracking-widest font-bold uppercase transition-all"
              >
                관리자 콘솔에서 첫 작업물 등록하기
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1 md:gap-4 lg:gap-6" id="portfolio-grid">
              {portfolioItems
                .sort((a, b) => a.order - b.order)
                .map((item, index) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: index * 0.05 }}
                    onClick={() => setSelectedVideo(item)}
                    className="aspect-square relative overflow-hidden group bg-neutral-50 border border-neutral-100 cursor-pointer select-none"
                    id={`portfolio-item-${item.id}`}
                  >
                    {/* Thumbnail Image */}
                    <ResolvedImage
                      src={item.thumbnailUrl}
                      alt={item.client}
                      className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-102"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />

                    {/* Simple Title overlay at bottom left */}
                    <span className="absolute bottom-3 left-3 text-[9px] md:text-[10px] uppercase tracking-wider font-bold text-white bg-black/60 px-2 py-1 backdrop-blur-xs group-hover:opacity-0 transition-opacity duration-300">
                      {item.title}
                    </span>

                    {/* Instagram-style Hover Overlay (Square design) */}
                    <div className="absolute inset-0 bg-neutral-950/80 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center p-4 text-center">
                      <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        whileInView={{ scale: 1, opacity: 1 }}
                        className="w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white mb-2"
                      >
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      </motion.div>
                      <p className="text-[9px] md:text-[10px] font-bold tracking-widest text-neutral-400 uppercase font-mono truncate w-full">
                        {item.title}
                      </p>
                      <p className="text-xs md:text-sm font-bold text-white uppercase tracking-tight truncate w-full px-1">
                        {item.client.split(" - ")[0]}
                      </p>
                      <p className="text-[9px] text-neutral-400 tracking-wider font-mono mt-0.5">
                        {item.year}
                      </p>
                    </div>
                  </motion.div>
                ))}
            </div>
          )}
        </section>

        {/* 3. Portfolio PDF Download Section */}
        <section className="mt-28 py-16 border-t border-b border-neutral-100 scroll-mt-24" id="portfolio-section">
          <div className="max-w-xl mx-auto text-center space-y-6">
            <div className="space-y-2">
              <h2 className="text-3xl font-bold font-display tracking-tight text-neutral-950">
                CHA CD PORTFOLIO
              </h2>
              <p className="text-sm text-neutral-500 leading-relaxed font-light">
                브랜드별 주요 프로젝트와 영상 제작 이력을 확인하실 수 있습니다.
              </p>
            </div>

            {portfolioSettings.pdfUrl || localPdfUrl ? (
              <a
                href={portfolioSettings.pdfUrl && portfolioSettings.pdfUrl.startsWith("http") ? portfolioSettings.pdfUrl : (localPdfUrl || portfolioSettings.pdfUrl)}
                download={portfolioSettings.pdfFileName}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 bg-black hover:bg-neutral-900 text-white font-bold tracking-widest text-xs uppercase px-8 py-4.5 transition-all cursor-pointer"
                id="portfolio-download-link"
              >
                <span>📄 Portfolio Download</span>
                <ArrowUpRight className="w-4 h-4 shrink-0 text-neutral-400" />
              </a>
            ) : (
              <div className="inline-block px-6 py-4 bg-neutral-50 border border-neutral-100 text-neutral-400 text-xs font-bold uppercase tracking-widest">
                등록된 포트폴리오 파일이 없습니다
              </div>
            )}

            {portfolioSettings.pdfFileName && (
              <p className="text-[10px] text-neutral-400 font-mono">
                파일명: {portfolioSettings.pdfFileName}
              </p>
            )}
          </div>
        </section>

        {/* 4. Contact Section */}
        <section className="mt-24 scroll-mt-24" id="contact-section">
          <div className="max-w-4xl mx-auto">
            <div className="text-center md:text-left mb-10 border-b border-neutral-100 pb-4">
              <h2 className="text-xs font-bold font-mono tracking-widest text-neutral-400 uppercase">
                Contact
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              {/* Left description */}
              <div className="space-y-6">
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold font-display tracking-tight leading-snug text-neutral-950">
                    다음 프로젝트는 CHA CD와 함께하세요!
                  </h3>
                  <p className="text-xs font-sans tracking-wide text-neutral-950 font-bold">
                    TVCF · AI Commercial · Digital Contents · OOH · Print
                  </p>
                </div>

                <div className="space-y-3 text-sm text-neutral-950 leading-relaxed font-light">
                  <p className="text-neutral-950">
                    기획부터 제작까지,<br />
                    브랜드에 필요한 크리에이티브를 제공합니다.
                  </p>
                  <p className="text-neutral-950">
                    24시간 상시 대기 중이오니 언제든 편하게 연락주세요!
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  {contactInfo.instagram && (
                    <a
                      href={`https://instagram.com/${contactInfo.instagram}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2.5 text-neutral-400 hover:text-neutral-950 hover:bg-neutral-50 transition-all border border-neutral-100"
                      title="Instagram"
                    >
                      <Instagram className="w-4 h-4" />
                    </a>
                  )}
                  {contactInfo.linkedin && (
                    <a
                      href={`https://${contactInfo.linkedin}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2.5 text-neutral-400 hover:text-neutral-950 hover:bg-neutral-50 transition-all border border-neutral-100"
                      title="LinkedIn"
                    >
                      <Linkedin className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>

              {/* Right contact details list */}
              <div className="space-y-4">
                <div className="flex items-start gap-4 p-5 border border-neutral-100 hover:border-neutral-200 hover:bg-neutral-50/40 transition-all">
                  <div className="p-2.5 bg-neutral-100 text-neutral-600 shrink-0">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] text-neutral-400 font-bold tracking-wider font-mono block uppercase">Email</span>
                    <a
                      href={`mailto:${contactInfo.email}`}
                      className="text-sm font-semibold text-neutral-800 hover:text-neutral-950 hover:underline transition-colors break-all"
                    >
                      {contactInfo.email}
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-5 border border-neutral-100 hover:border-neutral-200 hover:bg-neutral-50/40 transition-all">
                  <div className="p-2.5 bg-neutral-100 text-neutral-600 shrink-0">
                    <Phone className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] text-neutral-400 font-bold tracking-wider font-mono block uppercase">전화번호</span>
                    <a
                      href={`tel:${contactInfo.phone}`}
                      className="text-sm font-semibold text-neutral-800 hover:text-neutral-950 hover:underline transition-colors"
                    >
                      {contactInfo.phone}
                    </a>
                  </div>
                </div>

                {contactInfo.officeAddress && (
                  <div className="flex items-start gap-4 p-5 border border-neutral-100 hover:border-neutral-200 hover:bg-neutral-50/40 transition-all">
                    <div className="p-2.5 bg-neutral-100 text-neutral-600 shrink-0">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[10px] text-neutral-400 font-bold tracking-wider font-mono block uppercase">Office Location</span>
                      <p className="text-sm font-semibold text-neutral-800">
                        {contactInfo.officeAddress}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* 5. Footer (Copyright + Artistic Flair Minimalist 3-Column Quick Contact) */}
      <footer className="w-full bg-neutral-50 border-t border-neutral-100 py-12 px-4 md:px-8 mt-20">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-start md:items-end justify-between gap-8">
          
          {/* Quick Contact columns for Artistic Flair styling */}
          <div className="flex flex-wrap gap-x-12 gap-y-6">
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-widest text-neutral-400 font-bold font-mono">Email</p>
              <a href={`mailto:${contactInfo.email}`} className="text-xs font-semibold text-neutral-800 hover:text-black transition-colors">
                {contactInfo.email}
              </a>
            </div>

            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-widest text-neutral-400 font-bold font-mono">Phone</p>
              <a href={`tel:${contactInfo.phone}`} className="text-xs font-semibold text-neutral-800 hover:text-black transition-colors">
                {contactInfo.phone}
              </a>
            </div>

            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-widest text-neutral-400 font-bold font-mono">Portfolio</p>
              {localPdfUrl || portfolioSettings.pdfUrl ? (
                <a
                  href={localPdfUrl || portfolioSettings.pdfUrl}
                  download={portfolioSettings.pdfFileName}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold border-b border-black uppercase tracking-wider hover:opacity-75 transition-opacity"
                >
                  PDF Download
                </a>
              ) : (
                <span className="text-xs text-neutral-400 font-bold uppercase tracking-wider">미등록</span>
              )}
            </div>
          </div>

          {/* Right meta information and Admin triggers */}
          <div className="flex flex-col items-start md:items-end gap-3 shrink-0">
            <div className="text-left md:text-right space-y-0.5">
              <p className="text-[10px] uppercase tracking-widest text-neutral-300 font-bold font-mono">
                © {new Date().getFullYear()} CHA CD
              </p>
              <p className="text-[9px] uppercase tracking-widest text-neutral-400 font-mono">
                Creative Director
              </p>
            </div>

            {/* Subtle admin console trigger */}
            <button
              onClick={() => setIsAdminOpen(true)}
              className="text-[9px] uppercase tracking-widest text-neutral-400 hover:text-black transition-colors border-b border-dotted border-neutral-300 hover:border-black cursor-pointer font-mono font-bold"
              id="admin-console-trigger"
              title="관리자 인증하기"
            >
              Admin Console
            </button>
          </div>

        </div>
      </footer>

      {/* Modals & Slide-overs */}
      <AnimatePresence>
        {selectedVideo && (
          <VideoModal
            item={selectedVideo}
            onClose={() => setSelectedVideo(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isAdminOpen && (
          <AdminPanel
            isOpen={isAdminOpen}
            onClose={() => setIsAdminOpen(false)}
            portfolioItems={portfolioItems}
            contactInfo={contactInfo}
            portfolioSettings={portfolioSettings}
            onUpdateItems={syncAllPortfolioItemsToFirestore}
            onUpdateContact={saveContactInfoToFirestore}
            onUpdateSettings={savePortfolioSettingsToFirestore}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
