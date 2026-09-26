import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

const caseFinishes = [
  { name: "18k Rose Gold", color: "#b78358", note: "Warm & enduring", price: 48900 },
  { name: "Platinum 950", color: "#c8c8c3", note: "Quiet brilliance", price: 52900 },
  { name: "Midnight DLC", color: "#222522", note: "Contemporary matte", price: 46900 },
];

const dialFinishes = [
  { name: "Forest Green", color: "#173c32", note: "Sunray brushed" },
  { name: "Midnight Blue", color: "#1d2c46", note: "Grand feu enamel" },
  { name: "Warm Ivory", color: "#ded3bd", note: "Opaline finished" },
];

const craftDetails = [
  ["Case", "40 mm · 9.8 mm"],
  ["Movement", "Calibre A01 automatic"],
  ["Power reserve", "72 hours"],
  ["Water resistance", "100 metres"],
];

function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 10h11M11 5l5 5-5 5" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="m5 7 5 5 5-5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 5l14 14M19 5 5 19" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 7h18M3 12h18M3 17h18" />
    </svg>
  );
}

function HeartIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={filled ? "is-filled" : ""}>
      <path d="M20.8 4.7a5.5 5.5 0 0 0-7.8 0L12 5.8l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.4 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r=".8" className="social-dot" />
    </svg>
  );
}

function DiamondMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <i />
      <i />
    </span>
  );
}

function TextLink({ children, href }: { children: ReactNode; href: string }) {
  return (
    <a className="text-link" href={href}>
      <span>{children}</span>
      <ArrowIcon />
    </a>
  );
}

function Header({ onAppointment }: { onAppointment: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("menu-is-open", menuOpen);
    return () => document.body.classList.remove("menu-is-open");
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      <div className="announcement">
        <p>Complimentary worldwide delivery &amp; five-year warranty</p>
      </div>
      <header className={`site-header ${scrolled ? "is-scrolled" : ""}`}>
        <a className="wordmark" href="#top" aria-label="Aurelis home" onClick={closeMenu}>
          <DiamondMark />
          <span>AURELIS</span>
        </a>

        <nav className="desktop-nav" aria-label="Primary navigation">
          <a href="#collection">Collection</a>
          <a href="#craft">Our craft</a>
          <a href="#movement">The calibre</a>
          <a href="#services">Services</a>
        </nav>

        <div className="header-actions">
          <button className="appointment-link" type="button" onClick={onAppointment}>
            Book an appointment
          </button>
          <button
            className="menu-button"
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </header>

      <div className={`mobile-menu ${menuOpen ? "is-open" : ""}`} aria-hidden={!menuOpen}>
        <nav aria-label="Mobile navigation">
          <a href="#collection" onClick={closeMenu}>Collection <span>01</span></a>
          <a href="#craft" onClick={closeMenu}>Our craft <span>02</span></a>
          <a href="#movement" onClick={closeMenu}>The calibre <span>03</span></a>
          <a href="#services" onClick={closeMenu}>Services <span>04</span></a>
        </nav>
        <div className="mobile-menu-footer">
          <button type="button" onClick={() => { closeMenu(); onAppointment(); }}>
            Book a private appointment <ArrowIcon />
          </button>
          <p>Geneva · London · New York</p>
        </div>
      </div>
    </>
  );
}

function Hero({ onAppointment }: { onAppointment: () => void }) {
  return (
    <section className="hero" id="top">
      <div className="hero-copy page-shell">
        <p className="eyebrow hero-kicker"><span /> Introducing the Laureate No. 01</p>
        <h1>Time, refined<br />to its <em>essence.</em></h1>
        <p className="hero-description">
          A modern heirloom shaped by patience, precision and the quiet confidence of Swiss craft.
        </p>
        <div className="hero-actions">
          <a className="button button-dark" href="#collection">
            Discover the Laureate <ArrowIcon />
          </a>
          <button className="button button-quiet" type="button" onClick={onAppointment}>
            Arrange a viewing
          </button>
        </div>
        <div className="hero-proof" aria-label="Product highlights">
          <div><strong>72h</strong><span>Power reserve</span></div>
          <div><strong>40mm</strong><span>Hand-finished case</span></div>
          <div><strong>5 yr</strong><span>International warranty</span></div>
        </div>
      </div>
      <div className="hero-visual">
        <img
          src="/images/aurelis-hero.jpg"
          alt="The Aurelis Laureate in rose gold with a forest green dial"
          fetchPriority="high"
        />
        <div className="hero-caption">
          <span>Laureate No. 01</span>
          <span>Geneva · Switzerland</span>
        </div>
      </div>
      <a className="scroll-cue" href="#philosophy" aria-label="Scroll to our philosophy">
        <span>Scroll to discover</span><i />
      </a>
    </section>
  );
}

function Philosophy() {
  return (
    <section className="philosophy page-shell" id="philosophy">
      <p className="eyebrow centered">Our philosophy</p>
      <h2>Not made for the moment.<br /><em>Made for a lifetime.</em></h2>
      <p className="section-intro">
        We create fewer watches, with greater intention. Every Aurelis is assembled,
        finished and regulated by a single watchmaker in our Geneva atelier.
      </p>
      <div className="principles">
        <article>
          <span>01</span>
          <h3>Considered design</h3>
          <p>Pure proportions, lasting materials and no detail without purpose.</p>
        </article>
        <article>
          <span>02</span>
          <h3>Human hands</h3>
          <p>Individually assembled and finished by one dedicated watchmaker.</p>
        </article>
        <article>
          <span>03</span>
          <h3>Made responsibly</h3>
          <p>Traceable precious metals and production limited to 120 pieces a year.</p>
        </article>
      </div>
    </section>
  );
}

function ProductConfigurator({ onAppointment }: { onAppointment: () => void }) {
  const [caseIndex, setCaseIndex] = useState(0);
  const [dialIndex, setDialIndex] = useState(0);
  const [saved, setSaved] = useState(false);
  const selectedCase = caseFinishes[caseIndex];
  const selectedDial = dialFinishes[dialIndex];

  return (
    <section className="collection-section" id="collection">
      <div className="collection-heading page-shell">
        <div>
          <p className="eyebrow">The signature collection</p>
          <h2>Laureate <em>No. 01</em></h2>
        </div>
        <p>Ref. AUR–01 · Individually numbered</p>
      </div>

      <div className="product-layout page-shell">
        <div className="product-gallery">
          <div className="edition-chip">Edition of 120</div>
          <img
            src="/images/aurelis-hero.jpg"
            alt="Laureate No. 01 watch in the selected signature finish"
            loading="lazy"
          />
          <button
            type="button"
            className={`save-button ${saved ? "is-saved" : ""}`}
            onClick={() => setSaved((value) => !value)}
            aria-label={saved ? "Remove from saved pieces" : "Save this piece"}
            aria-pressed={saved}
          >
            <HeartIcon filled={saved} />
            <span>{saved ? "Saved" : "Save piece"}</span>
          </button>
          <div className="image-index"><span>01</span><i /><span>03</span></div>
        </div>

        <div className="product-panel">
          <p className="product-category">Automatic · 40 mm</p>
          <h3>The Laureate</h3>
          <p className="product-lead">
            Our purest expression of everyday elegance: a slim precious-metal case,
            hand-finished dial and the in-house A01 calibre visible through sapphire.
          </p>

          <div className="option-group">
            <div className="option-heading">
              <span>Case</span><strong>{selectedCase.name}</strong>
            </div>
            <div className="swatches" role="radiogroup" aria-label="Choose case finish">
              {caseFinishes.map((finish, index) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={caseIndex === index}
                  aria-label={`${finish.name}, ${finish.note}`}
                  className={caseIndex === index ? "is-active" : ""}
                  onClick={() => setCaseIndex(index)}
                  key={finish.name}
                >
                  <span style={{ backgroundColor: finish.color }} />
                  <small>{finish.name.replace("18k ", "")}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="option-group">
            <div className="option-heading">
              <span>Dial</span><strong>{selectedDial.name}</strong>
            </div>
            <div className="swatches" role="radiogroup" aria-label="Choose dial finish">
              {dialFinishes.map((finish, index) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={dialIndex === index}
                  aria-label={`${finish.name}, ${finish.note}`}
                  className={dialIndex === index ? "is-active" : ""}
                  onClick={() => setDialIndex(index)}
                  key={finish.name}
                >
                  <span style={{ backgroundColor: finish.color }} />
                  <small>{finish.name.replace("Forest ", "")}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="selection-note">
            <span className="selection-dot" style={{ background: selectedDial.color }} />
            <p><strong>Your selection</strong>{selectedCase.note} · {selectedDial.note}</p>
          </div>

          <div className="product-purchase">
            <div><span>From</span><strong>CHF {selectedCase.price.toLocaleString("en-CH")}</strong></div>
            <button className="button button-dark" type="button" onClick={onAppointment}>
              Enquire about this piece <ArrowIcon />
            </button>
          </div>
          <p className="delivery-note">Made to order · Estimated delivery in 14–16 weeks</p>
        </div>
      </div>
    </section>
  );
}

function Craft() {
  return (
    <section className="craft-section" id="craft">
      <div className="craft-image reveal-image">
        <img src="/images/aurelis-craft.jpg" alt="A watchmaker assembling an Aurelis movement by hand" loading="lazy" />
        <span>One watchmaker · One timepiece</span>
      </div>
      <div className="craft-copy">
        <p className="eyebrow">Made by hand in Geneva</p>
        <h2>Measured in<br /><em>patience.</em></h2>
        <p>
          There are no production lines in our atelier. From the first polish to final
          regulation, each Laureate remains with one watchmaker for more than 180 hours.
        </p>
        <blockquote>“The hand should be present, but never visible.”</blockquote>
        <TextLink href="#movement">Discover our craft</TextLink>
      </div>
    </section>
  );
}

function Movement() {
  return (
    <section className="movement-section" id="movement">
      <div className="movement-copy">
        <p className="eyebrow light">Calibre A01</p>
        <h2>Beauty beneath<br />the <em>surface.</em></h2>
        <p>
          Developed over five years, our first in-house automatic movement balances
          technical performance with traditional hand-finishing. Every bridge is bevelled,
          striped and polished in Geneva.
        </p>
        <div className="movement-stats">
          <div><strong>31</strong><span>Jewels</span></div>
          <div><strong>72</strong><span>Hours</span></div>
          <div><strong>4Hz</strong><span>Frequency</span></div>
        </div>
        <TextLink href="#specification">Explore the calibre</TextLink>
      </div>
      <div className="movement-image">
        <img src="/images/aurelis-movement.jpg" alt="Macro detail of the hand-finished Calibre A01" loading="lazy" />
        <div className="movement-orbit" aria-hidden="true"><span /></div>
      </div>
    </section>
  );
}

function Specification() {
  const [open, setOpen] = useState(false);
  return (
    <section className="spec-section page-shell" id="specification">
      <div className="spec-image">
        <img src="/images/aurelis-wrist.jpg" alt="A Laureate No. 01 worn with an ivory linen jacket" loading="lazy" />
        <p>Effortless from morning to evening.</p>
      </div>
      <div className="spec-copy">
        <p className="eyebrow">Designed to be lived in</p>
        <h2>Quiet confidence,<br /><em>every day.</em></h2>
        <p className="spec-lead">
          At just 9.8 mm, the Laureate slips naturally beneath a cuff. Its architecture
          is resilient enough for daily life and refined enough for every occasion.
        </p>
        <div className={`spec-drawer ${open ? "is-open" : ""}`}>
          <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
            Technical specification <ChevronIcon />
          </button>
          <div className="spec-drawer-content">
            <dl>
              {craftDetails.map(([label, value]) => (
                <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
              ))}
            </dl>
          </div>
        </div>
        <TextLink href="#collection">View the Laureate</TextLink>
      </div>
    </section>
  );
}

function Services({ onAppointment }: { onAppointment: () => void }) {
  return (
    <section className="services-section" id="services">
      <div className="page-shell">
        <p className="eyebrow centered">The Aurelis experience</p>
        <h2>With you, for <em>generations.</em></h2>
        <div className="service-grid">
          <article>
            <span className="service-number">01</span>
            <div className="service-icon" aria-hidden="true">✦</div>
            <h3>Private appointments</h3>
            <p>Discover the collection at your pace, online or in one of our private salons.</p>
            <button type="button" onClick={onAppointment}>Arrange a viewing <ArrowIcon /></button>
          </article>
          <article>
            <span className="service-number">02</span>
            <div className="service-icon" aria-hidden="true">◇</div>
            <h3>Personalisation</h3>
            <p>Choose your case, dial and strap, with complimentary hand engraving.</p>
            <a href="#collection">Create your piece <ArrowIcon /></a>
          </article>
          <article>
            <span className="service-number">03</span>
            <div className="service-icon" aria-hidden="true">◎</div>
            <h3>Lifetime care</h3>
            <p>International warranty, annual care checks and full restoration by our atelier.</p>
            <a href="#footer">Explore our services <ArrowIcon /></a>
          </article>
        </div>
      </div>
    </section>
  );
}

function Footer({ onAppointment }: { onAppointment: () => void }) {
  const [joined, setJoined] = useState(false);
  const subscribe = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setJoined(true);
  };

  return (
    <footer className="site-footer" id="footer">
      <div className="footer-top page-shell">
        <div className="footer-brand">
          <a className="wordmark footer-wordmark" href="#top" aria-label="Aurelis home">
            <DiamondMark /><span>AURELIS</span>
          </a>
          <p>Independent watchmaking,<br />shaped in Geneva.</p>
        </div>
        <div className="footer-newsletter">
          <p className="eyebrow light">Letters from the atelier</p>
          <h2>Stories worth<br /><em>taking time for.</em></h2>
          {joined ? (
            <p className="newsletter-success" role="status">Thank you. Your first letter will arrive shortly.</p>
          ) : (
            <form onSubmit={subscribe}>
              <label className="sr-only" htmlFor="newsletter-email">Email address</label>
              <input id="newsletter-email" type="email" placeholder="Your email address" required />
              <button type="submit" aria-label="Subscribe to atelier letters"><ArrowIcon /></button>
            </form>
          )}
        </div>
      </div>
      <div className="footer-links page-shell">
        <div><h3>Collection</h3><a href="#collection">Laureate No. 01</a><a href="#movement">Calibre A01</a><a href="#collection">Bespoke</a></div>
        <div><h3>Maison</h3><a href="#craft">Our story</a><a href="#craft">Craftsmanship</a><a href="#philosophy">Responsibility</a></div>
        <div><h3>Client care</h3><button type="button" onClick={onAppointment}>Book an appointment</button><a href="mailto:concierge@aurelis.ch">Contact</a><a href="#services">Care &amp; service</a></div>
        <div><h3>Visit us</h3><p>18 Rue du Rhône<br />1204 Genève<br />Switzerland</p><a href="mailto:concierge@aurelis.ch">concierge@aurelis.ch</a></div>
      </div>
      <div className="footer-bottom page-shell">
        <p>© 2026 Aurelis Genève</p>
        <div><a href="#footer">Privacy</a><a href="#footer">Terms</a><a href="#footer">Accessibility</a></div>
        <a href="#footer" aria-label="Aurelis on Instagram" className="social-link"><InstagramIcon /></a>
      </div>
    </footer>
  );
}

function AppointmentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [submitted, setSubmitted] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setSubmitted(false);
    const timer = window.setTimeout(() => closeButton.current?.focus(), 60);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="appointment-modal" role="dialog" aria-modal="true" aria-labelledby="appointment-title">
        <button ref={closeButton} className="modal-close" type="button" onClick={onClose} aria-label="Close appointment form">
          <CloseIcon />
        </button>
        {submitted ? (
          <div className="modal-success">
            <span>✓</span>
            <p className="eyebrow centered">Request received</p>
            <h2>We look forward<br />to meeting you.</h2>
            <p>Your personal concierge will contact you within one working day to arrange the details.</p>
            <button className="button button-dark" type="button" onClick={onClose}>Return to the collection</button>
          </div>
        ) : (
          <>
            <p className="eyebrow">Private appointment</p>
            <h2 id="appointment-title">Experience Aurelis,<br /><em>personally.</em></h2>
            <p className="modal-intro">Tell us how you would like to discover the Laureate. Your concierge will be in touch within one working day.</p>
            <form onSubmit={submit}>
              <div className="field-row">
                <label><span>First name</span><input name="firstName" autoComplete="given-name" required /></label>
                <label><span>Last name</span><input name="lastName" autoComplete="family-name" required /></label>
              </div>
              <label><span>Email address</span><input type="email" name="email" autoComplete="email" required /></label>
              <label><span>Preferred experience</span>
                <select name="experience" defaultValue="">
                  <option value="" disabled>Select an option</option>
                  <option>Geneva salon</option>
                  <option>London salon</option>
                  <option>New York salon</option>
                  <option>Private video appointment</option>
                </select>
              </label>
              <label><span>Anything we should know? <small>Optional</small></span><textarea name="message" rows={3} placeholder="Preferred dates, the piece you are interested in…" /></label>
              <button className="button button-dark" type="submit">Request an appointment <ArrowIcon /></button>
              <p className="privacy-note">By continuing, you agree to our privacy policy.</p>
            </form>
          </>
        )}
      </section>
    </div>
  );
}

export default function App() {
  const [appointmentOpen, setAppointmentOpen] = useState(false);
  const openAppointment = () => setAppointmentOpen(true);
  const closeAppointment = () => setAppointmentOpen(false);

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Header onAppointment={openAppointment} />
      <main id="main-content">
        <Hero onAppointment={openAppointment} />
        <Philosophy />
        <ProductConfigurator onAppointment={openAppointment} />
        <Craft />
        <Movement />
        <Specification />
        <Services onAppointment={openAppointment} />
      </main>
      <Footer onAppointment={openAppointment} />
      <AppointmentModal open={appointmentOpen} onClose={closeAppointment} />
    </>
  );
}
