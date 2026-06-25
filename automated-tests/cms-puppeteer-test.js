#!/usr/bin/env node

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

class CMSTestRunner {
  constructor() {
    this.browser = null;
    this.page = null;
    this.failures = [];
    this.config = {
      baseUrl: process.env.CMS_BASE_URL || 'http://localhost/cms',
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

  async failTest(name, error, screenshotName) {
    const message = error instanceof Error ? error.message : String(error);
    this.failures.push(`${name}: ${message}`);
    console.error(`❌ ${name} failed: ${message}`);

    if (screenshotName) {
      await this.takeScreenshot(screenshotName);
    }

    throw error;
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
        throw new Error(`API returned status: ${response.status}${response.error ? ` (${response.error})` : ''}`);
      }
    } catch (error) {
      await this.failTest('API health check', error, 'api-health-error');
    }
  }

  async testTagsApi() {
    console.log('\n🏷️ Testing Tags API...');
    
    try {
      // Test tags endpoint
      const response = await this.page.evaluate(async (apiUrl) => {
        try {
          const res = await fetch(`${apiUrl}/media/tags`);
          const data = await res.json();
          return { 
            status: res.status, 
            ok: res.ok, 
            isArray: Array.isArray(data),
            count: Array.isArray(data) ? data.length : 0,
            tags: Array.isArray(data) ? data : []
          };
        } catch (error) {
          return { status: 0, ok: false, error: error.message };
        }
      }, this.config.apiUrl);
      
      if (response.ok) {
        console.log(`✅ Tags API is responding (status: ${response.status})`);
        if (response.isArray) {
          console.log(`✅ Response is an array`);
          console.log(`📊 Available tags count: ${response.count}`);
          if (response.count > 0) {
            console.log(`🏷️ Tags: ${response.tags.join(', ')}`);
          }
        } else {
          console.log('⚠️ Response is not an array');
        }
      } else {
        throw new Error(`Tags API returned status: ${response.status}${response.error ? ` (${response.error})` : ''}`);
      }
    } catch (error) {
      await this.failTest('Tags API test', error, 'tags-api-error');
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
      await this.failTest('Home page test', error, 'home-page-error');
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
              
              // Test tag input functionality
              await this.addTagsDuringUpload();
              
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
      await this.failTest('Upload page test', error, 'upload-page-error');
    }
  }

  async addTagsDuringUpload() {
    console.log('\n🏷️ Testing tag input during upload...');
    
    try {
      // Find the TagInput component - look for the container with tag chips and input
      const tagInputContainer = await this.page.$('[class*="flex"][class*="flex-wrap"][class*="gap"]') ||
                                await this.page.$('[class*="border"][class*="rounded"]');
      
      // Find the tag input field within the upload form
      const tagInput = await this.page.$('input[placeholder*="tag"], input[placeholder*="Tag"]');
      
      if (tagInput) {
        console.log('✅ Tag input field found');
        
        // Add first tag
        await tagInput.click();
        await tagInput.type('nature');
        await this.page.keyboard.press('Enter');
        await this.delay(500);
        console.log('✅ Added tag: nature');
        
        // Add second tag
        await tagInput.click();
        await tagInput.type('test');
        await this.page.keyboard.press('Enter');
        await this.delay(500);
        console.log('✅ Added tag: test');
        
        // Add third tag using comma
        await tagInput.click();
        await tagInput.type('automated,');
        await this.delay(500);
        console.log('✅ Added tag: automated');
        
        await this.takeScreenshot('tags-added-during-upload');
        
        // Verify tags appear as chips
        const tagChips = await this.page.$$('[class*="rounded-full"][class*="bg-blue"]');
        if (tagChips.length > 0) {
          console.log(`✅ ${tagChips.length} tag chip(s) displayed`);
        } else {
          // Try alternative selector
          const altTagChips = await this.page.$$('span[class*="rounded-full"]');
          if (altTagChips.length > 0) {
            console.log(`✅ ${altTagChips.length} tag chip(s) displayed (alt selector)`);
          }
        }
        
      } else {
        console.log('⚠️ Tag input field not found - trying alternative selectors');
        
        // Try finding by label
        const tagLabel = await this.page.$('xpath=//label[contains(text(), "Tags")]');
        if (tagLabel) {
          const parentDiv = await tagLabel.$('xpath=..');
          const input = await parentDiv.$('input');
          if (input) {
            await input.click();
            await input.type('nature');
            await this.page.keyboard.press('Enter');
            console.log('✅ Added tag using label-based selector');
          }
        }
      }
      
    } catch (error) {
      console.log('⚠️ Tag input test during upload failed:', error.message);
    }
  }

  async testMediaModalTags() {
    console.log('\n🏷️ Testing Media Modal Tags...');
    
    try {
      // Navigate to home page first
      await this.page.goto(this.config.baseUrl, { waitUntil: 'networkidle0' });
      await this.delay(2000);
      
      // Find media items
      const mediaItems = await this.page.$$('[class*="media"], .tile, [data-testid*="media"], [class*="cursor-pointer"] img');
      
      if (mediaItems.length === 0) {
        console.log('⚠️ No media items found to test modal tags');
        return;
      }
      
      console.log(`📊 Found ${mediaItems.length} media items`);
      
      // Click on first media item to open modal
      await mediaItems[0].click();
      await this.delay(1500);
      
      // Check if modal opened
      const modal = await this.page.$('.fixed.inset-0, .modal, [role="dialog"]');
      if (!modal) {
        console.log('⚠️ Modal did not open');
        return;
      }
      
      console.log('✅ Media modal opened');
      await this.takeScreenshot('modal-tags-view-mode');
      
      // Look for tags section in modal
      const tagsLabel = await this.page.$('xpath=//label[contains(text(), "Tags")]');
      if (tagsLabel) {
        console.log('✅ Tags section found in modal');
      }
      
      // Check for existing tags in view mode
      const existingTags = await this.page.$$('.fixed [class*="rounded-full"][class*="bg-blue"]');
      console.log(`📊 Existing tags in view mode: ${existingTags.length}`);
      
      // Find and click Edit button
      const editButton = await this.page.$('button:has-text("Edit")') ||
                        await this.page.$('xpath=//button[contains(text(), "Edit")]');
      
      if (editButton) {
        await editButton.click();
        await this.delay(1000);
        console.log('✅ Edit mode activated');
        await this.takeScreenshot('modal-tags-edit-mode');
        
        // Try to add a new tag in edit mode
        const tagInput = await this.page.$('.fixed input[placeholder*="tag"], .fixed input[placeholder*="Tag"]');
        if (tagInput) {
          await tagInput.click();
          await tagInput.type('edited-tag');
          await this.page.keyboard.press('Enter');
          await this.delay(500);
          console.log('✅ Added new tag in edit mode');
          
          await this.takeScreenshot('modal-tag-added');
        }
        
        // Try to remove a tag (click the X button on a tag chip)
        const removeButtons = await this.page.$$('.fixed [class*="rounded-full"] button, .fixed span[class*="rounded-full"] button');
        if (removeButtons.length > 0) {
          await removeButtons[0].click();
          await this.delay(500);
          console.log('✅ Removed a tag');
          await this.takeScreenshot('modal-tag-removed');
        }
        
        // Save changes
        const saveButton = await this.page.$('xpath=//button[contains(text(), "Save")]') ||
                          await this.page.$('button:has-text("Save")');
        if (saveButton) {
          await saveButton.click();
          await this.delay(2000);
          console.log('✅ Changes saved');
          await this.takeScreenshot('modal-tags-saved');
        }
      } else {
        console.log('⚠️ Edit button not found');
      }
      
      // Close modal
      await this.page.keyboard.press('Escape');
      await this.delay(500);
      
      console.log('✅ Media modal tags test completed');
      
    } catch (error) {
      await this.failTest('Media modal tags test', error, 'modal-tags-error');
    }
  }

  async testGalleryTagFilter() {
    console.log('\n🔍 Testing Gallery Tag Filter...');
    
    try {
      // Navigate to home page
      await this.page.goto(this.config.baseUrl, { waitUntil: 'networkidle0' });
      await this.delay(2000);
      
      await this.takeScreenshot('gallery-before-filter');
      
      // Check for tag filter section
      const filterSection = await this.page.$('xpath=//h3[contains(text(), "Filter by tags")]') ||
                           await this.page.$('[class*="filter"], .tag-filter');
      
      if (!filterSection) {
        console.log('⚠️ Tag filter section not found - may not have any tags yet');
        
        // Check if there are any tags via API
        const tagsResponse = await this.page.evaluate(async (apiUrl) => {
          try {
            const res = await fetch(`${apiUrl}/media/tags`);
            const data = await res.json();
            return { count: Array.isArray(data) ? data.length : 0 };
          } catch (error) {
            return { count: 0, error: error.message };
          }
        }, this.config.apiUrl);
        
        if (tagsResponse.count === 0) {
          console.log('ℹ️ No tags exist yet - filter section correctly hidden');
          return;
        }
      }
      
      console.log('✅ Tag filter section found');
      
      // Get initial media count
      const initialMediaItems = await this.page.$$('[class*="grid-cols"] > div, .media-item, .tile');
      const initialCount = initialMediaItems.length;
      console.log(`📊 Initial media count: ${initialCount}`);
      
      // Find tag filter buttons
      const tagFilterButtons = await this.page.$$('button[class*="rounded-full"]');
      console.log(`📊 Found ${tagFilterButtons.length} tag filter buttons`);
      
      if (tagFilterButtons.length > 0) {
        // Click on first tag to filter
        const firstTagButton = tagFilterButtons[0];
        const tagText = await firstTagButton.evaluate(el => el.textContent);
        console.log(`🔄 Clicking on tag: ${tagText}`);
        
        await firstTagButton.click();
        await this.delay(1500);
        
        await this.takeScreenshot('gallery-filtered-by-tag');
        
        // Check filtered count
        const filteredMediaItems = await this.page.$$('[class*="grid-cols"] > div, .media-item, .tile');
        console.log(`📊 Filtered media count: ${filteredMediaItems.length}`);
        
        // Check if the count display updated
        const countText = await this.page.$eval('p[class*="text-gray"]', el => el.textContent).catch(() => null);
        if (countText) {
          console.log(`📊 Gallery count display: ${countText}`);
        }
        
        // Test multi-tag selection if more tags available
        if (tagFilterButtons.length > 1) {
          console.log('🔄 Testing multi-tag filter...');
          await tagFilterButtons[1].click();
          await this.delay(1500);
          
          await this.takeScreenshot('gallery-multi-tag-filter');
          
          const multiFilteredItems = await this.page.$$('[class*="grid-cols"] > div, .media-item, .tile');
          console.log(`📊 Multi-tag filtered count: ${multiFilteredItems.length}`);
        }
        
        // Test Clear filters button
        const clearButton = await this.page.$('xpath=//button[contains(text(), "Clear filters")]') ||
                           await this.page.$('button:has-text("Clear")');
        
        if (clearButton) {
          console.log('🔄 Testing Clear filters...');
          await clearButton.click();
          await this.delay(1500);
          
          await this.takeScreenshot('gallery-filters-cleared');
          
          // Verify count is back to original
          const clearedMediaItems = await this.page.$$('[class*="grid-cols"] > div, .media-item, .tile');
          console.log(`📊 Media count after clear: ${clearedMediaItems.length}`);
          
          if (clearedMediaItems.length === initialCount) {
            console.log('✅ Filters cleared successfully - count restored');
          }
        } else {
          console.log('⚠️ Clear filters button not found');
        }
      }
      
      console.log('✅ Gallery tag filter test completed');
      
    } catch (error) {
      await this.failTest('Gallery tag filter test', error, 'gallery-filter-error');
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
      await this.failTest('About page test', error, 'about-page-error');
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
      await this.failTest('Navigation test', error, 'navigation-error');
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
      await this.testTagsApi();
      
      // Run individual tests
      await this.testHomePage();
      await this.testUploadPage();
      await this.testMediaModalTags();
      await this.testGalleryTagFilter();
      await this.testAboutPage();
      await this.testNavigation();
      await this.testResponsiveDesign();

      console.log('\n✅ All tests completed successfully!');
      console.log('=' .repeat(50));
      
    } catch (error) {
      console.error('❌ Test suite failed:', error.message);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  async performContinuousTests(duration) {
    const endTime = Date.now() + duration;
    let cycle = 0;

    console.log(`\n🔄 Starting continuous testing for ${Math.round(duration / 1000 / 60)} minutes...`);
    console.log('=' .repeat(50));

    while (Date.now() < endTime) {
      cycle++;
      const remaining = Math.round((endTime - Date.now()) / 1000 / 60);
      console.log(`\n🔁 Cycle #${cycle} — ~${remaining} min remaining`);
      console.log('-'.repeat(50));

      try {
        await this.testApiHealth();
        await this.testHomePage();
        await this.testUploadPage();
        await this.testMediaModalTags();
        await this.testGalleryTagFilter();
        await this.testNavigation();
        console.log(`✅ Cycle #${cycle} completed`);
      } catch (error) {
        console.error(`❌ Cycle #${cycle} failed: ${error.message}`);
      }

      if (Date.now() < endTime) {
        await this.delay(5000);
      }
    }

    console.log(`\n✅ Continuous testing completed after ${cycle} cycle(s)`);
    console.log('=' .repeat(50));
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
  --tags-only             Run only tag-related tests
  --help, -h              Show this help message

Examples:
  node cms-puppeteer-test.js                    # Run all tests once
  node cms-puppeteer-test.js --continuous 600   # Run continuous tests for 10 minutes
  node cms-puppeteer-test.js --headless         # Run in headless mode
  node cms-puppeteer-test.js --tags-only        # Run only tag-related tests
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
  
  // Tags-only mode
  if (args.includes('--tags-only')) {
    runner.initialize().then(async () => {
      console.log('\n🏷️ Running tag-related tests only...');
      await runner.testTagsApi();
      await runner.testUploadPage(); // Includes tag input test
      await runner.testMediaModalTags();
      await runner.testGalleryTagFilter();
      console.log('\n✅ Tag tests completed!');
    }).then(() => {
      return runner.cleanup();
    }).catch(error => {
      console.error('❌ Tag tests failed:', error);
      return runner.cleanup().finally(() => process.exit(1));
    });
  } else {
    const continuousIndex = args.indexOf('--continuous');
    if (continuousIndex !== -1) {
      const duration = args[continuousIndex + 1] ? parseInt(args[continuousIndex + 1]) * 1000 : 300000;
      
      runner.initialize().then(() => {
        return runner.performContinuousTests(duration);
      }).then(() => {
        return runner.cleanup();
      }).catch(error => {
        console.error('❌ Continuous testing failed:', error);
        return runner.cleanup().finally(() => process.exit(1));
      });
    } else {
      runner.runAllTests().catch(error => {
        console.error('❌ CMS test runner failed:', error);
        process.exit(1);
      });
    }
  }
}

module.exports = CMSTestRunner;
