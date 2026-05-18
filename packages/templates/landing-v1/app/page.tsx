import { getContent } from './lib/content';
import { Hero } from './components/Hero';
import { Services } from './components/Services';
import { Testimonials } from './components/Testimonials';
import { About } from './components/About';
import { Contact } from './components/Contact';
import { Footer } from './components/Footer';

export default function Page() {
  const content = getContent();
  return (
    <main>
      <Hero content={content} />
      <Services content={content} />
      <About content={content} />
      <Testimonials content={content} />
      <Contact content={content} />
      <Footer content={content} />
    </main>
  );
}
