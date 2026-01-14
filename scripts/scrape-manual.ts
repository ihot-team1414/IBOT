import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { writeFileSync } from 'fs';
import { join } from 'path';

const BASE_URL = 'https://www.frcmanual.com/2026';

// Common FRC manual page names - we'll discover the actual ones
const commonPages = [
  'introduction',
  'game-rules',
  'robot-rules',
  'field-rules',
  'tournament-rules',
  'safety-rules',
  'equipment-rules',
  'alliance-rules',
  'scoring-rules',
  'penalty-rules',
];

async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
  }
  return await response.text();
}

async function discoverPages(): Promise<string[]> {
  try {
    const html = await fetchPage(`${BASE_URL}/`);
    const $ = cheerio.load(html);
    const pages: string[] = [];
    
    // Look for navigation links or links to /2026/ pages
    $('a[href^="/2026/"]').each((_, el) => {
      const href = $(el).attr('href');
      if (href) {
        const page = href.replace('/2026/', '').replace('/', '');
        if (page && !pages.includes(page) && page !== '') {
          pages.push(page);
        }
      }
    });
    
    return pages.length > 0 ? pages : commonPages;
  } catch (error) {
    console.log('Could not discover pages, using common page names:', error);
    return commonPages;
  }
}

async function scrapePage(pageName: string): Promise<string | null> {
  try {
    const url = `${BASE_URL}/${pageName}`;
    console.log(`Fetching ${url}...`);
    const html = await fetchPage(url);
    const $ = cheerio.load(html);
    
    // Remove scripts, styles, and navigation elements
    $('script, style, nav, header, footer').remove();
    
    // Find the main content area
    const mainContent = $('main, article, [role="main"], .content, .prose').first();
    const content = mainContent.length > 0 ? mainContent : $('body');
    
    // Convert to markdown
    const turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
    });
    
    const markdown = turndownService.turndown(content.html() || '');
    
    // Get the title
    const title = $('h1').first().text() || pageName;
    
    return `# ${title}\n\n${markdown}`;
  } catch (error) {
    console.error(`Error scraping ${pageName}:`, error);
    return null;
  }
}

async function main() {
  console.log('Discovering pages...');
  const pages = await discoverPages();
  
  console.log(`Found ${pages.length} pages:`, pages);
  
  // Ensure we have exactly 10 pages
  if (pages.length < 10) {
    console.log(`Only found ${pages.length} pages, trying common page names...`);
    // Try to fetch common pages that weren't discovered
    for (const page of commonPages) {
      if (!pages.includes(page)) {
        try {
          const testUrl = `${BASE_URL}/${page}`;
          const response = await fetch(testUrl);
          if (response.ok) {
            pages.push(page);
            if (pages.length >= 10) break;
          }
        } catch {
          // Page doesn't exist, skip
        }
      }
    }
  }
  
  // Limit to 10 pages
  const pagesToScrape = pages.slice(0, 10);
  
  console.log(`Scraping ${pagesToScrape.length} pages...`);
  
  const manualDir = join(process.cwd(), 'manual');
  
  for (const page of pagesToScrape) {
    const markdown = await scrapePage(page);
    if (markdown) {
      const filename = `${page}.md`;
      const filepath = join(manualDir, filename);
      writeFileSync(filepath, markdown, 'utf-8');
      console.log(`✓ Saved ${filename}`);
    } else {
      console.log(`✗ Failed to scrape ${page}`);
    }
    
    // Be polite - wait a bit between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('Done!');
}

main().catch(console.error);
