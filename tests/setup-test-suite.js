#!/usr/bin/env node

/**
 * W3C XML Test Suite Downloader
 * 
 * This script helps download and set up the W3C XML Test Suite for comprehensive testing.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

class TestSuiteDownloader {
    constructor() {
        this.testSuitePath = path.join(__dirname, '..', 'xmltest');
        this.downloadUrl = 'https://dev.w3.org/2005/11/testcases/xmlconf/xmltest.tgz';
        
        console.log('📦 W3C XML Test Suite Downloader');
        console.log('================================\n');
        
        this.checkAndDownload();
    }

    checkAndDownload() {
        if (fs.existsSync(this.testSuitePath)) {
            console.log('✅ W3C XML Test Suite already exists at:', this.testSuitePath);
            this.validateTestSuite();
            return;
        }

        console.log('📋 W3C XML Test Suite not found');
        console.log('   This test suite is required for comprehensive XML validation');
        console.log('   against the official W3C XML Test Collection.\n');
        
        console.log('🔗 Manual Download Instructions:');
        console.log('   1. Visit: https://dev.w3.org/2005/11/testcases/xmlconf/');
        console.log('   2. Download: xmltest.tgz');
        console.log(`   3. Extract to: ${this.testSuitePath}`);
        console.log('   4. Run the test suite: npm test\n');
        
        console.log('📂 Expected directory structure:');
        console.log('   xmltest/');
        console.log('   ├── valid/sa/        # Valid XML documents');
        console.log('   ├── invalid/         # Invalid XML documents');  
        console.log('   ├── not-wf/          # Not-well-formed documents');
        console.log('   └── xmlconf.xml      # Test suite configuration\n');
        
        console.log('💡 After setup, you can run:');
        console.log('   npm test                    # Full comprehensive test suite');
    }

    validateTestSuite() {
        console.log('🔍 Validating test suite structure...\n');
        
        const requiredPaths = [
            'valid/sa',
            'invalid', 
            'not-wf'
        ];
        
        let isValid = true;
        const stats = {};
        
        for (const reqPath of requiredPaths) {
            const fullPath = path.join(this.testSuitePath, reqPath);
            if (fs.existsSync(fullPath)) {
                const xmlFiles = this.countXmlFiles(fullPath);
                stats[reqPath] = xmlFiles;
                console.log(`   ✅ ${reqPath}: ${xmlFiles} XML test files`);
            } else {
                console.log(`   ❌ Missing: ${reqPath}`);
                isValid = false;
            }
        }
        
        if (isValid) {
            const totalTests = Object.values(stats).reduce((sum, count) => sum + count, 0);
            console.log(`\n✅ Test suite is ready! Total: ${totalTests} test files`);
            console.log('\n🚀 Run the comprehensive test suite with: npm test');
        } else {
            console.log('\n❌ Test suite structure is incomplete.');
            console.log('   Please re-download and extract the test suite.');
        }
    }

    countXmlFiles(dir) {
        let count = 0;
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    count += this.countXmlFiles(path.join(dir, entry.name));
                } else if (entry.name.endsWith('.xml')) {
                    count++;
                }
            }
        } catch (error) {
            // Directory might not be accessible
        }
        return count;
    }
}

if (require.main === module) {
    new TestSuiteDownloader();
}

module.exports = TestSuiteDownloader;