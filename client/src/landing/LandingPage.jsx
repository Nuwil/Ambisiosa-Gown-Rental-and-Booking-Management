import About from './About.jsx';
import Contact from './Contact.jsx';
import Footer from './Footer.jsx';
import Hero from './Hero.jsx';
import Navbar from './Navbar.jsx';
import ShopPreview from './ShopPreview.jsx';
import './landing.css';

export default function LandingPage() {
  return (
    <div className="landing-page min-h-screen">
      <a href="#home" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:text-paper">Skip to content</a>
      <Navbar />
      <main>
        <Hero />
        <About />
        <ShopPreview />
        <Contact />
      </main>
      <Footer />
    </div>
  );
}
