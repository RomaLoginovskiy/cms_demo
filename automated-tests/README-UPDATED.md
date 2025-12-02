# Automated Testing Suite for CMS Demo

Comprehensive automated testing using Puppeteer to validate the CMS application functionality across different deployment scenarios.

## Features

- ✅ Automated browser testing with Puppeteer
- 📸 Screenshot capture on test steps and failures
- 🔄 Continuous testing mode for load testing
- 📱 Responsive design testing
- 🎯 API health checks
- 🐳 Support for both Docker Compose and Kubernetes deployments

## Prerequisites

- Node.js 16 or higher
- CMS application running (either via Docker Compose or Kubernetes)
- Chrome/Chromium (installed automatically by Puppeteer)

## Quick Start

### 1. Install Dependencies

```bash
./run-tests.sh setup
```

Or manually:
```bash
npm install
```

### 2. Start the CMS Application

#### For Kubernetes Deployment (Recommended):
```bash
cd ../k8s
./deploy.sh
```

The application will be available at `http://localhost`

#### For Docker Compose Deployment:
```bash
cd ..
docker-compose up -d
```

The application will be available at `http://localhost:3000`

### 3. Run Tests

#### For Kubernetes Deployment:
```bash
./run-tests.sh test
```

#### For Docker Compose Deployment:
```bash
CMS_BASE_URL=http://localhost:3000 \
CMS_API_URL=http://localhost:8080/api \
./run-tests.sh test
```

## Test Commands

### Basic Commands

| Command | Description |
|---------|-------------|
| `./run-tests.sh setup` | Install dependencies and verify environment |
| `./run-tests.sh test` | Run all tests once (browser visible) |
| `./run-tests.sh test-headless` | Run all tests in headless mode |
| `./run-tests.sh check` | Check if application is running |
| `./run-tests.sh clean` | Clean up generated files |

### Continuous Testing

| Command | Description |
|---------|-------------|
| `./run-tests.sh test-quick` | 3-minute continuous testing |
| `./run-tests.sh test-continuous` | 10-minute continuous testing |
| `./run-tests.sh test-long` | 30-minute continuous testing |

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CMS_BASE_URL` | `http://localhost` | Frontend URL |
| `CMS_API_URL` | `http://localhost/api` | Backend API URL |
| `HEADLESS` | `false` | Run tests in headless mode |

### Deployment-Specific Configuration

#### Kubernetes Deployment (Default)
```bash
# Uses default values (ingress routes)
./run-tests.sh test
```

Environment:
- Frontend: `http://localhost`
- Backend API: `http://localhost/api`

#### Docker Compose Deployment
```bash
# Set environment variables for Docker Compose ports
export CMS_BASE_URL=http://localhost:3000
export CMS_API_URL=http://localhost:8080/api
./run-tests.sh test
```

Environment:
- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8080/api`

#### Headless Mode
```bash
# Run without opening browser window
HEADLESS=true ./run-tests.sh test
```

## Test Suite Coverage

The automated tests cover:

1. **API Health Check**
   - API endpoint connectivity
   - Response validation

2. **Home/Gallery Page**
   - Page load and rendering
   - Navigation elements
   - Media grid display
   - Media item interactions
   - Empty state handling

3. **Upload Page**
   - Page navigation
   - File upload interface
   - Form field validation
   - Upload submission
   - Success/error handling

4. **About Page**
   - Page load and content
   - Navigation functionality

5. **Navigation Flow**
   - Link functionality
   - URL changes
   - Page transitions

6. **Responsive Design**
   - Mobile viewport (375x667)
   - Tablet viewport (768x1024)
   - Desktop viewport (1920x1080)

## Output

### Screenshots
All screenshots are saved to the `screenshots/` directory with timestamps:
- `YYYY-MM-DDTHH-mm-ss-SSS-[test-name].png`

### Test Data
Dummy test files are created in the `test-data/` directory.

## Example Output

```bash
🚀 Starting comprehensive CMS testing...
==================================================
📍 Base URL: http://localhost
🔌 API URL: http://localhost/api
==================================================

🏥 Testing API Health...
✅ API is responding (status: 200)

🏠 Testing Home/Gallery Page...
📍 Navigating to http://localhost...
📄 Page title: React App
✅ Navigation found
✅ Navigation link found: Gallery
✅ Navigation link found: Upload
✅ Navigation link found: About
✅ Hero section found
✅ Media gallery grid found
📊 Found 2 media items
✅ Home page test completed

⬆️ Testing Upload Page...
✅ Successfully navigated to upload page
✅ Upload dropzone found
🔄 Testing file upload...
✅ File upload triggered
✅ File preview displayed
✅ Upload page test completed

📖 Testing About Page...
✅ Successfully navigated to about page
✅ About page content found
✅ About page test completed

🧭 Testing Navigation Flow...
✅ Navigation flow test completed

📱 Testing Responsive Design...
✅ Responsive design test completed

✅ All tests completed successfully!
```

## Troubleshooting

### Application Not Accessible

**For Kubernetes:**
```bash
# Check if pods are running
kubectl get pods -n cms-demo

# Check ingress
kubectl get ingress -n cms-demo

# Check if LoadBalancer is ready
kubectl get svc -n ingress-nginx

# Verify application is accessible
curl http://localhost
curl http://localhost/api/media
```

**For Docker Compose:**
```bash
# Check if containers are running
docker-compose ps

# Check logs
docker-compose logs frontend
docker-compose logs backend

# Verify application is accessible
curl http://localhost:3000
curl http://localhost:8080/api/media
```

### Tests Failing

1. **Wrong URL configuration:**
   ```bash
   # Check which deployment you're using
   ./run-tests.sh check
   ```

2. **Application not ready:**
   ```bash
   # Wait for all pods to be ready (Kubernetes)
   kubectl wait --for=condition=ready pod -l app=frontend -n cms-demo
   kubectl wait --for=condition=ready pod -l app=backend -n cms-demo
   ```

3. **Port conflicts:**
   - Ensure no other applications are using port 80 (Kubernetes) or 3000/8080 (Docker)

### Browser Issues

```bash
# Clear Puppeteer cache
rm -rf node_modules/.cache/puppeteer

# Reinstall Puppeteer
npm install puppeteer
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Deploy to Kubernetes
        run: |
          # Setup k8s cluster (kind, minikube, etc.)
          ./k8s/deploy.sh
      
      - name: Run Tests
        run: |
          cd automated-tests
          npm install
          HEADLESS=true ./run-tests.sh test
      
      - name: Upload Screenshots
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: test-screenshots
          path: automated-tests/screenshots/
```

## Advanced Usage

### Custom Test Scenarios

Extend the test script by adding new methods to the `CMSTestRunner` class:

```javascript
async testCustomScenario() {
  console.log('🔬 Testing custom scenario...');
  // Your custom test logic here
  await this.page.goto(`${this.config.baseUrl}/custom-page`);
  // ... more test logic
}
```

Then call it from `runAllTests()`:
```javascript
await this.testCustomScenario();
```

### NPM Scripts

You can also use npm scripts directly:

```bash
# Run all tests
npm test

# Headless mode
npm run test:headless

# Continuous testing (10 minutes)
npm run test:continuous

# Continuous + headless
npm run test:continuous:headless
```

### Environment File

Create a `.env` file for persistent configuration:

```bash
# .env file
CMS_BASE_URL=http://localhost
CMS_API_URL=http://localhost/api
HEADLESS=false
```

Then source it before running tests:
```bash
source .env
./run-tests.sh test
```

## Best Practices

1. **Run tests in headless mode for CI/CD**
   ```bash
   HEADLESS=true ./run-tests.sh test
   ```

2. **Use continuous testing for load/stress testing**
   ```bash
   ./run-tests.sh test-long  # 30 minutes
   ```

3. **Check environment before running tests**
   ```bash
   ./run-tests.sh check
   ```

4. **Clean up old screenshots regularly**
   ```bash
   ./run-tests.sh clean
   ```

5. **Monitor test output for console errors**
   - The test suite captures and logs browser console messages
   - Check for JavaScript errors or API failures

## License

This testing suite is part of the CMS Demo project.
