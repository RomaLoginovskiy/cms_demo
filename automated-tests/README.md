# CMS Demo - Automated Testing Suite

This directory contains automated testing scripts for the CMS Demo application using Puppeteer.

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ installed
- CMS Demo application running (frontend on port 3000, backend on port 8080)

### Installation
```bash
cd automated-tests
npm install
```

### Running Tests

#### Basic Test Run
```bash
npm test
```
Runs all tests once through the application pages and functionality.

#### Headless Mode
```bash
npm run test:headless
```
Runs tests without opening a browser window (faster, good for CI/CD).

#### Continuous Testing
```bash
npm run test:continuous
```
Runs tests continuously for 10 minutes, randomly testing different features.

#### Continuous + Headless
```bash
npm run test:continuous:headless
```
Combines continuous testing with headless mode.

#### Custom Duration
```bash
node cms-puppeteer-test.js --continuous 1800  # 30 minutes
```

## 🧪 What Gets Tested

### Page Navigation
- ✅ Home/Gallery page loading and functionality
- ✅ Upload page navigation and form interaction
- ✅ About page content verification
- ✅ Navigation between all pages

### Media Gallery Features
- ✅ Media grid display
- ✅ Empty state handling
- ✅ Media item click interactions
- ✅ Modal opening/closing

### Upload Functionality
- ✅ File drag & drop area
- ✅ File selection and preview
- ✅ Metadata input (title, description)
- ✅ Upload button interaction
- ✅ Upload progress indicators

### User Experience
- ✅ Responsive design testing (mobile, tablet, desktop)
- ✅ Error handling and loading states
- ✅ Console error monitoring
- ✅ Network request monitoring

### Continuous Testing Features
- 🔄 Random test selection
- 🔄 Variable wait times between tests
- 🔄 Screenshot capture for debugging
- 🔄 Error recovery and logging

## 📁 Generated Files

The script creates these directories and files during execution:

- `screenshots/` - Timestamped screenshots of test runs
- `test-data/` - Dummy files created for upload testing

## 🛠️ Configuration

You can modify the test configuration by editing the `config` object in `cms-puppeteer-test.js`:

```javascript
this.config = {
  baseUrl: 'http://localhost:3000',  // Frontend URL
  headless: false,                   // Show/hide browser
  timeout: 30000,                    // Default timeout (ms)
  screenshotPath: './screenshots',   // Screenshot directory
  testDataPath: './test-data'        // Test files directory
};
```

## 🚨 Troubleshooting

### Application Not Running
Make sure your CMS application is running:
```bash
# In the project root
docker-compose up
# Or start frontend/backend separately
```

### Browser Issues
If you encounter browser-related errors:
```bash
# Install Chrome dependencies (Linux)
sudo apt-get install -y chromium-browser

# Or use system Chrome
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
export PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome
```

### Permission Issues
```bash
chmod +x cms-puppeteer-test.js
```

## 📊 Example Output

```
🚀 Starting comprehensive CMS testing...
==================================================

🏠 Testing Home/Gallery Page...
📄 Page title: CMS Demo
✅ Navigation found
✅ Navigation link found: Gallery
✅ Navigation link found: Upload
✅ Navigation link found: About
✅ Hero section found
✅ Media gallery grid found
📊 Found 3 media items
🖱️ Testing media item click...
✅ Media modal opened
✅ Modal closed with Escape key
✅ Home page test completed

⬆️ Testing Upload Page...
✅ Successfully navigated to upload page
✅ Upload dropzone found
🔄 Testing file upload...
✅ File upload triggered
✅ File preview displayed
✅ Title input filled
✅ Description input filled
🔄 Testing upload submission...
✅ Upload button clicked
✅ Upload page test completed

📖 Testing About Page...
✅ Successfully navigated to about page
✅ About page content found
✅ About page contains relevant content
✅ About page test completed

🧭 Testing Navigation Flow...
🔄 Navigating to Gallery...
📍 Current URL: http://localhost:3000/
🔄 Navigating to Upload...
📍 Current URL: http://localhost:3000/upload
🔄 Navigating to About...
📍 Current URL: http://localhost:3000/about
✅ Navigation flow test completed

📱 Testing Responsive Design...
🔄 Testing Mobile (375x667)...
✅ Navigation visible on Mobile
🔄 Testing Tablet (768x1024)...
✅ Navigation visible on Tablet
🔄 Testing Desktop (1920x1080)...
✅ Navigation visible on Desktop
✅ Responsive design test completed

🔄 Starting continuous testing phase...
🔄 Starting continuous testing for 180 seconds...

✅ All tests completed successfully!
==================================================
```

## 🔧 Advanced Usage

### Custom Test Scenarios
You can extend the test script by adding new methods to the `CMSTestRunner` class:

```javascript
async testCustomScenario() {
  console.log('🔬 Testing custom scenario...');
  // Your custom test logic here
}
```

### Environment Variables
Set environment variables to customize behavior:
```bash
export CMS_TEST_URL=http://localhost:3000
export CMS_TEST_HEADLESS=true
export CMS_TEST_TIMEOUT=60000
```

### Integration with CI/CD
Add to your CI pipeline:
```yaml
- name: Run Automated Tests
  run: |
    cd automated-tests
    npm install
    npm run test:headless
```

## 📝 License

This testing suite is part of the CMS Demo project and follows the same license terms.