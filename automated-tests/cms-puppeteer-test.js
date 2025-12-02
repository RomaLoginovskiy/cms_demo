#!/usr/bin/env node

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

class CMSTestRunner {
  constructor() {
    this.browser = null;
    this.page = null;
    this.config = {
      baseUrl: process.env.CMS_BASE_URL || 'http://localhost', // Updated for Kubernetes deployment
      apiUrl: process.env.CMS_API_URL || 'http://localhost/api', // Added API URL
      headless: process.env.HEADLESS === 'true' || false, // Set to true for headless mode
      timeout: 30000,
      screenshotPath: path.join(__dirname, 'screenshots'),
      testDataPath: path.join(__dirname, 'test-data')
    };
    
    // Ensure directories exist
    this.ensureDirectories();
  }

  ensureDirectories() {
    if (!fs.existsSync(this.config.screenshotPath)) {
      fs.mkdirSync(this.config.screenshotPath, { recursive: true });
    }
    if (!fs.existsSync(this.config.testDataPath)) {
      fs.mkdirSync(this.config.testDataPath, { recursive: true });
    }
  }

  async initialize() {
    console.log('🚀 Initializing Puppeteer...');
    
    this.browser = await puppeteer.launch({
      headless: this.config.headless,
      defaultViewport: { width: 1920, height: 1080 },
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    });

    this.page = await this.browser.newPage();
    
    // Set user agent
    await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Enable request interception for monitoring
    await this.page.setRequestInterception(true);
    this.page.on('request', (request) => {
      console.log(`🌐 ${request.method()} ${request.url()}`);
      request.continue();
    });

    // Listen for console messages
    this.page.on('console', (msg) => {
      console.log(`📋 Console [${msg.type()}]: ${msg.text()}`);
    });

    // Listen for page errors
    this.page.on('pageerror', (error) => {
      console.error(`❌ Page error: ${error.message}`);
    });

    await this.page.setDefaultTimeout(this.config.timeout);
    
    console.log('✅ Puppeteer initialized successfully');
  }

  async takeScreenshot(name) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${timestamp}-${name}.png`;
    const filepath = path.join(this.config.screenshotPath, filename);
    
    await this.page.screenshot({ 
      path: filepath, 
      fullPage: true 
    });
    
    console.log(`📸 Screenshot saved: ${filename}`);
    return filepath;
  }

  async waitForPageLoad() {
    try {
      await this.page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 5000 });
    } catch (error) {
      // Fallback - just wait a bit
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async testApiHealth() {
    console.log('\n🏥 Testing API Health...');
    
    try {
      // Test API endpoint
      const response = await this.page.evaluate(async (apiUrl) => {
        try {
          const res = await fetch(`${apiUrl}/media`);
          return { status: res.status, ok: res.ok };
        } catch (error) {
          return { status: 0, ok: false, error: error.message };
        }
      }, this.config.apiUrl);
      
      if (response.ok) {
        console.log(`✅ API is responding (status: ${response.status})`);
      } else {
        console.log(`⚠️ API returned status: ${response.status}`);
      }
    } catch (error) {
      console.log('⚠️ API health check failed:', error.message);
    }
  }

  async testHomePage() {
    console.log('\n🏠 Testing Home/Gallery Page...');
    
    try {
      // Navigate to home page
      console.log(`📍 Navigating to ${this.config.baseUrl}...`);
      await this.page.goto(this.config.baseUrl, { waitUntil: 'networkidle0' });
      await this.takeScreenshot('home-page-loaded');
      
      // Check if page title is correct
      const title = await this.page.title();
      console.log(`📄 Page title: ${title}`);
      
      // Check for main navigation elements
      await this.page.waitForSelector('nav', { timeout: 5000 });
      console.log('✅ Navigation found');
      
      // Check navigation links
      const navLinks = ['Gallery', 'Upload', 'About'];
      for (const linkText of navLinks) {
        try {
          const link = await this.page.waitForSelector(`a[href*="${linkText.toLowerCase()}"]`, { timeout: 2000 });
          if (link) {
            console.log(`✅ Navigation link found: ${linkText}`);
          }
        } catch (error) {
          console.log(`⚠️ Navigation link missing: ${linkText}`);
        }
      }
      
      // Check for Hero section
      try {
        await this.page.waitForSelector('.text-3xl, h1, .hero', { timeout: 5000 });
        console.log('✅ Hero section found');
      } catch (error) {
        console.log('⚠️ Hero section not found or took too long to load');
      }
      
      // Check for media gallery or empty state
      try {
        const galleryExists = await this.page.$('.grid, .gallery, [class*="grid-cols"]');
        if (galleryExists) {
          console.log('✅ Media gallery grid found');
          
          // Check for media items
          const mediaItems = await this.page.$$('[class*="media"], .tile, [data-testid*="media"]');
          console.log(`📊 Found ${mediaItems.length} media items`);
          
          // If there are media items, test clicking on one
          if (mediaItems.length > 0) {
            console.log('🖱️ Testing media item click...');
            await mediaItems[0].click();
            await this.delay(1500);
            
            // Check if modal opened
            const modal = await this.page.$('.modal, [role="dialog"], .fixed');
            if (modal) {
              console.log('✅ Media modal opened');
              await this.takeScreenshot('media-modal-open');
              
              // Close modal (try different methods)
              try {
                await this.page.keyboard.press('Escape');
                await this.delay(500);
                console.log('✅ Modal closed with Escape key');
              } catch (error) {
                console.log('⚠️ Could not close modal with Escape');
              }
            }
          }
        } else {
          // Check for empty state
          const emptyState = await this.page.$('.text-center, .empty, [class*="no-media"]');
          if (emptyState) {
            console.log('✅ Empty state displayed (no media uploaded yet)');
          }
        }
      } catch (error) {
        console.log('⚠️ Gallery section loading issue:', error.message);
      }
      
      console.log('✅ Home page test completed');
      
    } catch (error) {
      console.error('❌ Home page test failed:', error.message);
      await this.takeScreenshot('home-page-error');
    }
  }

  async testUploadPage() {
    console.log('\n⬆️ Testing Upload Page...');
    
    try {
      // Navigate to upload page
      const uploadLink = await this.page.$('a[href="/upload"], a[href*="upload"]');
      if (uploadLink) {
        await uploadLink.click();
        await this.delay(1000);
      } else {
        await this.page.goto(`${this.config.baseUrl}/upload`);
      }
      await this.waitForPageLoad();
      await this.takeScreenshot('upload-page-loaded');
      
      // Check URL
      const url = this.page.url();
      if (url.includes('/upload')) {
        console.log('✅ Successfully navigated to upload page');
      }
      
      // Check for upload form/dropzone
      const dropzone = await this.page.$('[class*="border-dashed"], .dropzone, input[type="file"]');
      if (dropzone) {
        console.log('✅ Upload dropzone found');
      }
      
      // Test file upload simulation (create a dummy file)
      const dummyFilePath = await this.createDummyImage();
      
      if (dummyFilePath && fs.existsSync(dummyFilePath)) {
        try {
          // Find file input
          const fileInput = await this.page.$('input[type="file"]');
          if (fileInput) {
            console.log('🔄 Testing file upload...');
            await fileInput.uploadFile(dummyFilePath);
            await this.delay(2000);
            
            await this.takeScreenshot('file-uploaded');
            console.log('✅ File upload triggered');
            
            // Check if file appears in the upload queue
            const uploadPreview = await this.page.$('.preview, [class*="upload"], img[src*="blob:"]');
            if (uploadPreview) {
              console.log('✅ File preview displayed');
            }
            
            // Try to fill in metadata
            try {
              const titleInput = await this.page.$('input[placeholder*="title"], input[name*="title"]') || 
                                await this.page.$('xpath=//label[contains(text(), "Title")]/following-sibling::input') ||
                                await this.page.$('xpath=//label[contains(text(), "Title")]/..//input');
              if (titleInput) {
                await titleInput.click();
                await titleInput.type('Test Image Title');
                console.log('✅ Title input filled');
              }
              
              const descInput = await this.page.$('input[placeholder*="description"], textarea[name*="description"]') ||
                               await this.page.$('xpath=//label[contains(text(), "Description")]/following-sibling::input') ||
                               await this.page.$('xpath=//label[contains(text(), "Description")]/..//input') ||
                               await this.page.$('xpath=//label[contains(text(), "Description")]/..//textarea');
              if (descInput) {
                await descInput.click();
                await descInput.type('Test image description for automated testing');
                console.log('✅ Description input filled');
              }
            } catch (error) {
              console.log('⚠️ Could not fill metadata inputs:', error.message);
            }
            
            // Look for upload button
            const uploadButton = await this.page.$('button[type="submit"]') ||
                                await this.page.$('.upload-btn, .btn-upload');
            if (uploadButton) {
              console.log('🔄 Testing upload submission...');
              await uploadButton.click();
              await this.delay(3000);
              console.log('✅ Upload button clicked');
              await this.takeScreenshot('upload-submitted');
            }
          }
        } catch (error) {
          console.log('⚠️ File upload test failed:', error.message);
        }
      }
      
      console.log('✅ Upload page test completed');
      
    } catch (error) {
      console.error('❌ Upload page test failed:', error.message);
      await this.takeScreenshot('upload-page-error');
    }
  }

  async testAboutPage() {
    console.log('\n📖 Testing About Page...');
    
    try {
      // Navigate to about page
      const aboutLink = await this.page.$('a[href="/about"], a[href*="about"]');
      if (aboutLink) {
        await aboutLink.click();
        await this.delay(1000);
      } else {
        await this.page.goto(`${this.config.baseUrl}/about`);
      }
      await this.waitForPageLoad();
      await this.takeScreenshot('about-page-loaded');
      
      // Check URL
      const url = this.page.url();
      if (url.includes('/about')) {
        console.log('✅ Successfully navigated to about page');
      }
      
      // Check for content
      const content = await this.page.$('h2, .about, p');
      if (content) {
        console.log('✅ About page content found');
        
        // Get text content
        const textContent = await this.page.evaluate(() => document.body.innerText);
        if (textContent.includes('demo') || textContent.includes('CMS')) {
          console.log('✅ About page contains relevant content');
        }
      }
      
      console.log('✅ About page test completed');
      
    } catch (error) {
      console.error('❌ About page test failed:', error.message);
      await this.takeScreenshot('about-page-error');
    }
  }

  async testNavigation() {
    console.log('\n🧭 Testing Navigation Flow...');
    
    try {
      // Test navigation between all pages multiple times
      const pages = [
        { name: 'Gallery', href: '/', selector: 'a[href="/"], a[href*="gallery"]' },
        { name: 'Upload', href: '/upload', selector: 'a[href="/upload"]' },
        { name: 'About', href: '/about', selector: 'a[href="/about"]' },
        { name: 'Gallery', href: '/', selector: 'a[href="/"], a[href*="gallery"]' }
      ];
      
      for (const page of pages) {
        console.log(`🔄 Navigating to ${page.name}...`);
        
        try {
          // Click navigation link
          const navLink = await this.page.$(page.selector);
          if (navLink) {
            await navLink.click();
            await this.delay(1000);
            
            // Verify URL changed
            const currentUrl = this.page.url();
            console.log(`📍 Current URL: ${currentUrl}`);
            
            await this.delay(1000);
          } else {
            console.log(`⚠️ Navigation link not found: ${page.name}`);
            // Fallback to direct navigation
            await this.page.goto(`${this.config.baseUrl}${page.href}`);
            await this.delay(1000);
          }
        } catch (error) {
          console.log(`⚠️ Error navigating to ${page.name}:`, error.message);
        }
      }
      
      console.log('✅ Navigation flow test completed');
      
    } catch (error) {
      console.error('❌ Navigation test failed:', error.message);
      await this.takeScreenshot('navigation-error');
    }
  }

  async testResponsiveDesign() {
    console.log('\n📱 Testing Responsive Design...');
    
    const viewports = [
      { name: 'Mobile', width: 375, height: 667 },
      { name: 'Tablet', width: 768, height: 1024 },
      { name: 'Desktop', width: 1920, height: 1080 }
    ];
    
    for (const viewport of viewports) {
      try {
        console.log(`🔄 Testing ${viewport.name} (${viewport.width}x${viewport.height})...`);
        
        await this.page.setViewport(viewport);
        await this.delay(1000);
        
        await this.takeScreenshot(`responsive-${viewport.name.toLowerCase()}`);
        
        // Check if navigation is accessible
        const nav = await this.page.$('nav');
        if (nav) {
          console.log(`✅ Navigation visible on ${viewport.name}`);
        }
        
      } catch (error) {
        console.log(`⚠️ Responsive test failed for ${viewport.name}:`, error.message);
      }
    }
    
    // Reset to desktop
    await this.page.setViewport({ width: 1920, height: 1080 });
    console.log('✅ Responsive design test completed');
  }

  async createDummyImage() {
    try {
      // Create a simple 1x1 pixel PNG in base64
      const base64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
      const buffer = Buffer.from(base64Data, 'base64');
      const filePath = path.join(this.config.testDataPath, 'test-image.png');
      
      fs.writeFileSync(filePath, buffer);
      console.log('✅ Dummy test image created');
      return filePath;
      
    } catch (error) {
      console.log('⚠️ Could not create dummy image:', error.message);
      return null;
    }
  }

  async performContinuousTests(duration = 300000) { // 5 minutes default
    console.log(`\n🔄 Starting continuous testing for ${duration / 1000} seconds...`);
    
    const startTime = Date.now();
    let cycleCount = 0;
    
    while (Date.now() - startTime < duration) {
      cycleCount++;
      console.log(`\n🔄 === Test Cycle ${cycleCount} ===`);
      
      try {
        // Randomly pick a test to run
        const tests = [
          () => this.testHomePage(),
          () => this.testUploadPage(),
          () => this.testAboutPage(),
          () => this.testNavigation()
        ];
        
        const randomTest = tests[Math.floor(Math.random() * tests.length)];
        await randomTest();
        
        // Random wait between tests
        const waitTime = Math.random() * 5000 + 2000; // 2-7 seconds
        console.log(`⏳ Waiting ${Math.round(waitTime / 1000)}s before next test...`);
        await this.delay(waitTime);
        
      } catch (error) {
        console.error(`❌ Error in test cycle ${cycleCount}:`, error.message);
      }
    }
    
    console.log(`\n✅ Continuous testing completed. Ran ${cycleCount} test cycles.`);
  }

  async runAllTests() {
    try {
      await this.initialize();
      
      console.log('\n🚀 Starting comprehensive CMS testing...');
      console.log('=' .repeat(50));
      console.log(`📍 Base URL: ${this.config.baseUrl}`);
      console.log(`🔌 API URL: ${this.config.apiUrl}`);
      console.log('=' .repeat(50));
      
      // Test API health first
      await this.testApiHealth();
      
      // Run individual tests
      await this.testHomePage();
      await this.testUploadPage();
      await this.testAboutPage();
      await this.testNavigation();
      await this.testResponsiveDesign();
      
      console.log('\n🔄 Starting continuous testing phase...');
      await this.performContinuousTests(180000); // 3 minutes of continuous testing
      
      console.log('\n✅ All tests completed successfully!');
      console.log('=' .repeat(50));
      
    } catch (error) {
      console.error('❌ Test suite failed:', error.message);
    } finally {
      await this.cleanup();
    }
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up...');
    
    if (this.page) {
      await this.page.close();
    }
    
    if (this.browser) {
      await this.browser.close();
    }
    
    console.log('✅ Cleanup completed');
  }
}

// CLI handling
if (require.main === module) {
  const args = process.argv.slice(2);
  const runner = new CMSTestRunner();
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
CMS Puppeteer Test Runner

Usage: node cms-puppeteer-test.js [options]

Options:
  --continuous [duration]  Run continuous testing (duration in seconds, default: 300)
  --headless              Run in headless mode
  --help, -h              Show this help message

Examples:
  node cms-puppeteer-test.js                    # Run all tests once
  node cms-puppeteer-test.js --continuous 600   # Run continuous tests for 10 minutes
  node cms-puppeteer-test.js --headless         # Run in headless mode
    `);
    process.exit(0);
  }
  
  if (args.includes('--headless')) {
    runner.config.headless = true;
  }
  
  // Check environment variables
  if (process.env.CMS_BASE_URL) {
    console.log(`📍 Using custom base URL: ${process.env.CMS_BASE_URL}`);
  }
  if (process.env.CMS_API_URL) {
    console.log(`🔌 Using custom API URL: ${process.env.CMS_API_URL}`);
  }
  
  const continuousIndex = args.indexOf('--continuous');
  if (continuousIndex !== -1) {
    const duration = args[continuousIndex + 1] ? parseInt(args[continuousIndex + 1]) * 1000 : 300000;
    
    runner.initialize().then(() => {
      return runner.performContinuousTests(duration);
    }).then(() => {
      return runner.cleanup();
    }).catch(error => {
      console.error('❌ Continuous testing failed:', error);
      runner.cleanup();
    });
  } else {
    runner.runAllTests();
  }
}

module.exports = CMSTestRunner;