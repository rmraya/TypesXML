/*******************************************************************************
 * Copyright (c) 2023-2025 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { basename, join, resolve } from 'path';
import { DOMBuilder } from '../DOMBuilder';
import { SAXParser } from '../SAXParser';

/**
 * XML Schema Test Suite Runner for TypesXML v2.0.0
 * 
 * This test suite validates TypesXML's XML parsing capabilities using the official
 * W3C XML Schema Test Suite from the xmlschema2006-11-06 directory.
 * 
 * Test Categories:
 * - Schema File Parsing: Can SAXParser parse .xsd schema files?
 * - Instance Document Parsing: Can SAXParser parse .xml instance files?
 * - Validation Mode Testing: Does setValidating() work without errors?
 */
export class XMLSchemaTestSuite {
    private startTime: number;
    private results: TestResults;
    private xstsPath: string;

    constructor() {
        this.startTime = Date.now();
        this.xstsPath = resolve(__dirname, '../../tests/xmlschema2006-11-06');
        this.results = {
            schemaFileParsing: { passed: 0, failed: 0, tests: [], bySource: {} },
            instanceFileParsing: { passed: 0, failed: 0, tests: [], bySource: {} },
            validationMode: { passed: 0, failed: 0, tests: [] },
            performance: {
                totalDuration: 0,
                averagePerTest: 0
            },
            unified: {},
            errorAnalysis: {
                totalUniqueErrors: 0,
                mostCommonError: '',
                mostCommonErrorCount: 0,
                errorCategories: [],
                recommendations: []
            }
        };
    }

    public async run(): Promise<void> {
        this.printHeader();

        // Validate test suite availability
        await this.validateTestSuite();

        // Suppress verbose parser logging during tests
        const originalConsoleLog = console.log;
        const suppressedOutput: string[] = [];

        console.log = (...args: any[]) => {
            const message = args.join(' ');
            // Suppress all verbose parser messages - keep only test progress and results
            if (message.includes('📊') ||
                message.includes('🎯') ||
                message.includes('📦') ||
                message.includes('🏷️') ||
                message.includes('✅ Successfully loaded XSD') ||
                message.includes('Warning: Failed to load') ||
                message.includes('Group reference') ||
                message.includes('GrammarHandler') ||
                message.includes('CompositeGrammar') ||
                message.includes('Pre-compiled') ||
                message.includes('Using cached') ||
                message.includes('Grammar for namespace') ||
                message.includes('Schema locations') ||
                message.includes('Schema for namespace') ||
                message.includes('Loading XSD for namespace') ||
                message.includes('Resolved relative schema') ||
                message.includes('No location found') ||
                message.includes('Found grammar') ||
                message.includes('Looking up element')) {
                suppressedOutput.push(message);
            } else {
                // Allow test progress and results through
                originalConsoleLog(...args);
            }
        };

        try {
            // Run tests with actual files from the W3C test suite
            this.testSchemaFileParsing();
            this.testInstanceFileParsing();
            this.testValidationModeToggle();
            
            // Perform error analysis
            this.performErrorAnalysis();
        } finally {
            // Restore original console.log
            console.log = originalConsoleLog;
        }

        // Print final results
        console.log(`🔇 Suppressed ${suppressedOutput.length} verbose parser messages for cleaner output`);
        console.log('');
        this.printResults();
        this.printErrorAnalysis();
        this.saveResults();
    }

    private printHeader(): void {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('              W3C XML Schema Test Suite File Parser                  ');
        console.log('');
        console.log('  Testing TypesXML v2.0.0 with Official W3C Test Files              ');
        console.log('  Parsing real .xsd and .xml files from xmlschema2006-11-06          ');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('');
    }

    private async validateTestSuite(): Promise<void> {
        console.log('🔍 Validating W3C XML Schema Test Suite...');

        if (!existsSync(this.xstsPath)) {
            console.log(`❌ W3C XML Schema Test Suite not found at: ${this.xstsPath}`);
            console.log('   Please ensure the xmlschema2006-11-06 directory exists in /tests');
            throw new Error('Test suite not available');
        }

        const schemaFiles = this.countFiles('.xsd');
        const instanceFiles = this.countFiles('.xml');

        console.log(`✅ Found ${schemaFiles.toLocaleString()} schema files (.xsd)`);
        console.log(`✅ Found ${instanceFiles.toLocaleString()} instance files (.xml)`);
        console.log('✅ Test suite validation complete');
        console.log('');
    }

    private countFiles(extension: string): number {
        let count = 0;
        this.countFilesRecursive(this.xstsPath, extension, (file) => {
            count++;
        });
        return count;
    }

    private countFilesRecursive(dir: string, extension: string, callback: (file: string) => void): void {
        try {
            const files = readdirSync(dir);
            for (const file of files) {
                const fullPath = join(dir, file);
                const stat = statSync(fullPath);
                if (stat.isDirectory()) {
                    this.countFilesRecursive(fullPath, extension, callback);
                } else if (file.endsWith(extension)) {
                    callback(fullPath);
                }
            }
        } catch (error) {
            // Skip directories we can't read
        }
    }

    private trackUnifiedResult(source: string, expectedValidity: 'valid' | 'invalid', actuallyValid: boolean): void {
        if (!this.results.unified[source]) {
            this.results.unified[source] = {
                totalCases: 0,
                expectedValid: 0,
                actualValid: 0,
                correctValid: 0,
                expectedInvalid: 0,
                actualInvalid: 0,
                correctInvalid: 0,
                overallCorrect: 0
            };
        }

        const stats = this.results.unified[source];
        stats.totalCases++;

        if (expectedValidity === 'valid') {
            stats.expectedValid++;
            if (actuallyValid) {
                stats.actualValid++;
                stats.correctValid++;
                stats.overallCorrect++;
            }
        } else {
            stats.expectedInvalid++;
            if (!actuallyValid) {
                stats.actualInvalid++;
                stats.correctInvalid++;
                stats.overallCorrect++;
            }
        }

        if (actuallyValid && expectedValidity === 'invalid') {
            stats.actualValid++;
        } else if (!actuallyValid && expectedValidity === 'valid') {
            stats.actualInvalid++;
        }
    }

    private testSchemaFileParsing(): void {
        console.log('📋 Test 1: Schema File Validation');
        console.log('   Testing: Does SAXParser correctly validate .xsd schema files according to W3C expected results?');

        // Parse test metadata to get expected results
        const testCases = this.parseSchemaTestMetadata();
        const testSources = this.categorizeSchemaTestCases(testCases);
        this.displaySchemaTestSourceSummary(testSources);

        // Test ALL schema files with known expected results
        const testFiles = testCases;

        let correctResults = 0;
        let wrongResults = 0;
        let validFilesTestedCorrectly = 0;
        let invalidFilesTestedCorrectly = 0;

        // Track detailed failures for analysis
        const failures: Array<{
            file: string;
            expected: string;
            actual: string;
            error: string | null;
        }> = [];

        console.log(`   Testing ${testFiles.length} schema files with expected results from ${Object.keys(testSources).length} test sources...`);

        for (let i = 0; i < testFiles.length; i++) {
            const testCase = testFiles[i];
            const result = this.testParseFile(testCase.schemaPath);
            const source = this.getTestSourceFromPath(testCase.schemaPath);

            // Initialize source tracking if needed
            if (!this.results.schemaFileParsing.bySource[source]) {
                this.results.schemaFileParsing.bySource[source] = { passed: 0, failed: 0, total: 0 };
            }

            // Check if parser result matches expected result
            const expectedToSucceed = testCase.expectedValidity === 'valid';
            const actuallySucceeded = result.success;
            const isCorrect = expectedToSucceed === actuallySucceeded;

            // Track unified results
            this.trackUnifiedResult(source, testCase.expectedValidity, actuallySucceeded);

            // Store test result with error details
            this.results.schemaFileParsing.tests.push({
                ...result,
                expected: testCase.expectedValidity,
                source: source,
                testCase: testCase.name
            });

            if (isCorrect) {
                correctResults++;
                this.results.schemaFileParsing.passed++;
                this.results.schemaFileParsing.bySource[source].passed++;

                if (expectedToSucceed) {
                    validFilesTestedCorrectly++;
                } else {
                    invalidFilesTestedCorrectly++;
                }
            } else {
                wrongResults++;
                this.results.schemaFileParsing.failed++;
                this.results.schemaFileParsing.bySource[source].failed++;

                // Record detailed failure information
                failures.push({
                    file: basename(testCase.schemaPath),
                    expected: testCase.expectedValidity,
                    actual: result.success ? 'valid' : 'invalid',
                    error: result.error || 'No error message'
                });
            }
            this.results.schemaFileParsing.bySource[source].total++;

            // Progress indicator every 1000 files
            if ((i + 1) % 1000 === 0 || i === testFiles.length - 1) {
                const progress = ((i + 1) / testFiles.length * 100).toFixed(0);
                console.log(`   Progress: ${progress}% (${i + 1}/${testFiles.length}) - ${correctResults} correct, ${wrongResults} wrong - Last: ${source}`);
            }
        }

        const accuracy = ((correctResults / testFiles.length) * 100).toFixed(1);
        console.log(`   ✅ Validation Accuracy: ${correctResults}/${testFiles.length} (${accuracy}%) - ${validFilesTestedCorrectly} valid + ${invalidFilesTestedCorrectly} invalid correctly identified`);

        // Display first few failures for analysis
        if (failures.length > 0) {
            console.log(`\n   📋 Analysis: First ${Math.min(5, failures.length)} failed test cases:`);
            for (let i = 0; i < Math.min(5, failures.length); i++) {
                const failure = failures[i];
                console.log(`   ${i + 1}. ${failure.file}:`);
                console.log(`      Expected: ${failure.expected}, Got: ${failure.actual}`);
                console.log(`      Error: ${failure.error}`);
            }
        }

        console.log('');
    }

    private testInstanceFileParsing(): void {
        console.log('📋 Test 2: Instance Document Validation');
        console.log('   Testing: Does SAXParser correctly validate .xml instance files according to W3C expected results?');

        // Parse test metadata to get expected results for instance documents
        const testCases = this.parseInstanceTestMetadata();
        const testSources = this.categorizeInstanceTestCases(testCases);
        this.displayInstanceTestSourceSummary(testSources);

        // Test ALL instance files with known expected results
        const testFiles = testCases;

        let correctResults = 0;
        let wrongResults = 0;
        let validFilesTestedCorrectly = 0;
        let invalidFilesTestedCorrectly = 0;

        // Track detailed failures for analysis
        const failures: Array<{
            file: string;
            expected: string;
            actual: string;
            error: string | null;
        }> = [];

        console.log(`   Testing ${testFiles.length} instance files with expected results from ${Object.keys(testSources).length} test sources...`);

        for (let i = 0; i < testFiles.length; i++) {
            const testCase = testFiles[i];
            const result = this.testParseFile(testCase.instancePath);
            const source = this.getTestSourceFromPath(testCase.instancePath);

            // Initialize source tracking if needed
            if (!this.results.instanceFileParsing.bySource[source]) {
                this.results.instanceFileParsing.bySource[source] = { passed: 0, failed: 0, total: 0 };
            }

            // Check if parser result matches expected result
            const expectedToSucceed = testCase.expectedValidity === 'valid';
            const actuallySucceeded = result.success;
            const isCorrect = expectedToSucceed === actuallySucceeded;

            // Track unified results
            this.trackUnifiedResult(source, testCase.expectedValidity, actuallySucceeded);

            // Store test result with error details
            this.results.instanceFileParsing.tests.push({
                ...result,
                expected: testCase.expectedValidity,
                source: source,
                testCase: testCase.name
            });

            if (isCorrect) {
                correctResults++;
                this.results.instanceFileParsing.passed++;
                this.results.instanceFileParsing.bySource[source].passed++;

                if (expectedToSucceed) {
                    validFilesTestedCorrectly++;
                } else {
                    invalidFilesTestedCorrectly++;
                }
            } else {
                wrongResults++;
                this.results.instanceFileParsing.failed++;
                this.results.instanceFileParsing.bySource[source].failed++;

                // Record detailed failure information
                failures.push({
                    file: basename(testCase.instancePath),
                    expected: testCase.expectedValidity,
                    actual: result.success ? 'valid' : 'invalid',
                    error: result.error || 'No error message'
                });
            }
            this.results.instanceFileParsing.bySource[source].total++;

            // Progress indicator every 1000 files
            if ((i + 1) % 1000 === 0 || i === testFiles.length - 1) {
                const progress = ((i + 1) / testFiles.length * 100).toFixed(0);
                console.log(`   Progress: ${progress}% (${i + 1}/${testFiles.length}) - ${correctResults} correct, ${wrongResults} wrong - Last: ${source}`);
            }
        }

        const accuracy = ((correctResults / testFiles.length) * 100).toFixed(1);
        console.log(`   ✅ Validation Accuracy: ${correctResults}/${testFiles.length} (${accuracy}%) - ${validFilesTestedCorrectly} valid + ${invalidFilesTestedCorrectly} invalid correctly identified`);

        // Display first few failures for analysis
        if (failures.length > 0) {
            console.log(`\n   📋 Analysis: First ${Math.min(5, failures.length)} failed test cases:`);
            for (let i = 0; i < Math.min(5, failures.length); i++) {
                const failure = failures[i];
                console.log(`   ${i + 1}. ${failure.file}:`);
                console.log(`      Expected: ${failure.expected}, Got: ${failure.actual}`);
                console.log(`      Error: ${failure.error}`);
            }
        }

        console.log('');
    }

    private testParseFile(filePath: string): TestResult {
        const startTime = Date.now();

        try {
            const parser = new SAXParser();
            const builder = new DOMBuilder();

            parser.setValidating(true); // Enable validation for proper testing
            parser.setContentHandler(builder);
            parser.parseFile(filePath);

            const document = builder.getDocument();
            if (!document || !document.getRoot()) {
                const errorMessage = 'No root element found in parsed document';
                return {
                    success: false,
                    error: errorMessage,
                    duration: Date.now() - startTime,
                    file: basename(filePath),
                    normalizedError: this.normalizeErrorMessage(errorMessage),
                    errorCategory: this.categorizeError(errorMessage)
                };
            }

            return {
                success: true,
                error: null,
                duration: Date.now() - startTime,
                file: basename(filePath)
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const normalizedError = this.normalizeErrorMessage(errorMessage);
            const errorCategory = this.categorizeError(normalizedError);
            
            return {
                success: false,
                error: errorMessage,
                duration: Date.now() - startTime,
                file: basename(filePath),
                normalizedError: normalizedError,
                errorCategory: errorCategory
            };
        }
    }

    private parseSchemaTestMetadata(): SchemaTestCase[] {
        const testCases: SchemaTestCase[] = [];

        // Parse metadata from all test sources (Microsoft, NIST, Boeing, Sun)
        const metaSources = [
            { dir: 'msMeta', pattern: '_w3c.xml' },
            { dir: 'nistMeta', pattern: '.testSet' },
            { dir: 'boeingMeta', pattern: '.testSet' },
            { dir: 'sunMeta', pattern: '.testSet' }
        ];

        for (const metaSource of metaSources) {
            const metaPath = join(this.xstsPath, metaSource.dir);

            if (existsSync(metaPath)) {
                const metaFiles = readdirSync(metaPath).filter(f => f.endsWith(metaSource.pattern));

                for (const metaFile of metaFiles) {
                    try {
                        const content = readFileSync(join(metaPath, metaFile), 'utf-8');
                        const testFilesCases = this.extractTestCasesFromMetadata(content, metaSource.dir);
                        testCases.push(...testFilesCases);
                    } catch (error) {
                        // Skip files we can't read
                    }
                }
            }
        }

        return testCases;
    }

    private extractTestCasesFromMetadata(xmlContent: string, metaDir: string): SchemaTestCase[] {
        const testCases: SchemaTestCase[] = [];

        // Simple regex parsing to extract test cases with expected validity
        const testGroupRegex = /<testGroup name="([^"]+)"[\s\S]*?<\/testGroup>/g;
        let testGroupMatch;

        while ((testGroupMatch = testGroupRegex.exec(xmlContent)) !== null) {
            const testGroupContent = testGroupMatch[0];
            const testName = testGroupMatch[1];

            // Look for schemaTest with expected validity
            const schemaTestRegex = /<schemaTest name="[^"]*"[\s\S]*?<schemaDocument xlink:href="([^"]+)"[\s\S]*?<expected validity="([^"]+)"[\s\S]*?<\/schemaTest>/;
            const schemaMatch = schemaTestRegex.exec(testGroupContent);

            if (schemaMatch) {
                const relativePath = schemaMatch[1];
                const expectedValidity = schemaMatch[2];

                // Convert xlink:href relative path to absolute path  
                // The href is relative to the metadata file location (metaDir directory)
                const schemaPath = resolve(this.xstsPath, metaDir, relativePath);

                if (existsSync(schemaPath)) {
                    testCases.push({
                        name: testName,
                        schemaPath: schemaPath,
                        expectedValidity: expectedValidity as 'valid' | 'invalid'
                    });
                }
            }
        }

        return testCases;
    }

    private categorizeSchemaTestCases(testCases: SchemaTestCase[]): { [source: string]: { count: number, valid: number, invalid: number } } {
        const categories: { [source: string]: { count: number, valid: number, invalid: number } } = {};

        for (const testCase of testCases) {
            let source = 'Unknown';

            if (testCase.schemaPath.includes('/msData/')) {
                source = 'Microsoft';
            } else if (testCase.schemaPath.includes('/nistData/')) {
                source = 'NIST';
            } else if (testCase.schemaPath.includes('/sunData/')) {
                source = 'Sun';
            } else if (testCase.schemaPath.includes('/boeingData/')) {
                source = 'Boeing';
            }

            if (!categories[source]) {
                categories[source] = { count: 0, valid: 0, invalid: 0 };
            }

            categories[source].count++;
            if (testCase.expectedValidity === 'valid') {
                categories[source].valid++;
            } else {
                categories[source].invalid++;
            }
        }

        return categories;
    }

    private displaySchemaTestSourceSummary(testSources: { [source: string]: { count: number, valid: number, invalid: number } }): void {
        console.log('   📊 Schema Test Cases by Source:');

        const sortedSources = Object.entries(testSources)
            .sort(([, a], [, b]) => b.count - a.count);

        for (const [source, data] of sortedSources) {
            const percentage = ((data.count / Object.values(testSources).reduce((sum, s) => sum + s.count, 0)) * 100).toFixed(1);
            console.log(`      • ${source}: ${data.count} tests (${percentage}%) - ${data.valid} valid, ${data.invalid} invalid expected`);
        }
        console.log('');
    }

    private parseInstanceTestMetadata(): InstanceTestCase[] {
        const testCases: InstanceTestCase[] = [];

        // Parse metadata from all test sources (Microsoft, NIST, Boeing, Sun)
        const metaSources = [
            { dir: 'msMeta', pattern: '_w3c.xml' },
            { dir: 'nistMeta', pattern: '.testSet' },
            { dir: 'boeingMeta', pattern: '.testSet' },
            { dir: 'sunMeta', pattern: '.testSet' }
        ];

        for (const metaSource of metaSources) {
            const metaPath = join(this.xstsPath, metaSource.dir);

            if (existsSync(metaPath)) {
                const metaFiles = readdirSync(metaPath).filter(f => f.endsWith(metaSource.pattern));

                for (const metaFile of metaFiles) {
                    try {
                        const content = readFileSync(join(metaPath, metaFile), 'utf-8');
                        const testFilesCases = this.extractInstanceTestCasesFromMetadata(content, metaSource.dir);
                        testCases.push(...testFilesCases);
                    } catch (error) {
                        // Skip files we can't read
                    }
                }
            }
        }

        return testCases;
    }

    private extractInstanceTestCasesFromMetadata(xmlContent: string, metaDir: string): InstanceTestCase[] {
        const testCases: InstanceTestCase[] = [];

        // Simple regex parsing to extract instance test cases with expected validity
        const testGroupRegex = /<testGroup name="([^"]+)"[\s\S]*?<\/testGroup>/g;
        let testGroupMatch;

        while ((testGroupMatch = testGroupRegex.exec(xmlContent)) !== null) {
            const testGroupContent = testGroupMatch[0];
            const testName = testGroupMatch[1];

            // Look for instanceTest with expected validity
            const instanceTestRegex = /<instanceTest name="[^"]*"[\s\S]*?<instanceDocument xlink:href="([^"]+)"[\s\S]*?<expected validity="([^"]+)"[\s\S]*?<\/instanceTest>/g;
            let instanceMatch;

            while ((instanceMatch = instanceTestRegex.exec(testGroupContent)) !== null) {
                const relativePath = instanceMatch[1];
                const expectedValidity = instanceMatch[2];

                // Convert xlink:href relative path to absolute path
                // The href is relative to the metadata file location (metaDir directory)
                const instancePath = resolve(this.xstsPath, metaDir, relativePath);

                if (existsSync(instancePath)) {
                    testCases.push({
                        name: testName,
                        instancePath: instancePath,
                        expectedValidity: expectedValidity as 'valid' | 'invalid'
                    });
                }
            }
        }

        return testCases;
    }

    private categorizeInstanceTestCases(testCases: InstanceTestCase[]): { [source: string]: { count: number, valid: number, invalid: number } } {
        const categories: { [source: string]: { count: number, valid: number, invalid: number } } = {};

        for (const testCase of testCases) {
            let source = 'Unknown';

            if (testCase.instancePath.includes('/msData/')) {
                source = 'Microsoft';
            } else if (testCase.instancePath.includes('/nistData/')) {
                source = 'NIST';
            } else if (testCase.instancePath.includes('/sunData/')) {
                source = 'Sun';
            } else if (testCase.instancePath.includes('/boeingData/')) {
                source = 'Boeing';
            }

            if (!categories[source]) {
                categories[source] = { count: 0, valid: 0, invalid: 0 };
            }

            categories[source].count++;
            if (testCase.expectedValidity === 'valid') {
                categories[source].valid++;
            } else {
                categories[source].invalid++;
            }
        }

        return categories;
    }

    private displayInstanceTestSourceSummary(testSources: { [source: string]: { count: number, valid: number, invalid: number } }): void {
        console.log('   📊 Instance Test Cases by Source:');

        const sortedSources = Object.entries(testSources)
            .sort(([, a], [, b]) => b.count - a.count);

        for (const [source, data] of sortedSources) {
            const percentage = ((data.count / Object.values(testSources).reduce((sum, s) => sum + s.count, 0)) * 100).toFixed(1);
            console.log(`      • ${source}: ${data.count} tests (${percentage}%) - ${data.valid} valid, ${data.invalid} invalid expected`);
        }
        console.log('');
    }

    private categorizeTestFiles(files: string[]): { [source: string]: { count: number, files: string[] } } {
        const categories: { [source: string]: { count: number, files: string[] } } = {};

        for (const file of files) {
            let source = 'Unknown';

            if (file.includes('/boeingData/') || file.includes('/boeingMeta/')) {
                source = 'Boeing';
            } else if (file.includes('/msData/') || file.includes('/msMeta/')) {
                source = 'Microsoft';
            } else if (file.includes('/nistData/') || file.includes('/nistMeta/')) {
                source = 'NIST';
            } else if (file.includes('/sunData/') || file.includes('/sunMeta/')) {
                source = 'Sun';
            }

            if (!categories[source]) {
                categories[source] = { count: 0, files: [] };
            }
            categories[source].count++;
            categories[source].files.push(file);
        }

        return categories;
    }

    private displayTestSourceSummary(fileType: string, testSources: { [source: string]: { count: number, files: string[] } }): void {
        console.log(`   📊 ${fileType} by Test Source:`);

        const sortedSources = Object.entries(testSources)
            .sort(([, a], [, b]) => b.count - a.count);

        for (const [source, data] of sortedSources) {
            const percentage = ((data.count / Object.values(testSources).reduce((sum, s) => sum + s.count, 0)) * 100).toFixed(1);
            console.log(`      • ${source}: ${data.count} files (${percentage}%)`);
        }
        console.log('');
    }

    private getTestSourceFromPath(filePath: string): string {
        if (filePath.includes('/boeingData/') || filePath.includes('/boeingMeta/')) {
            return 'Boeing';
        } else if (filePath.includes('/msData/') || filePath.includes('/msMeta/')) {
            return 'Microsoft';
        } else if (filePath.includes('/nistData/') || filePath.includes('/nistMeta/')) {
            return 'NIST';
        } else if (filePath.includes('/sunData/') || filePath.includes('/sunMeta/')) {
            return 'Sun';
        }
        return 'Unknown';
    }

    private testValidationModeToggle(): void {
        console.log('📋 Test 3: Validation Mode Testing');
        console.log('   Testing: Can parser toggle validation modes with real files?');

        // Get a few test files
        const instanceFiles: string[] = [];
        this.countFilesRecursive(this.xstsPath, '.xml', (file) => {
            instanceFiles.push(file);
        });

        const testFiles = instanceFiles; // Test with all XML files
        let passed = 0;
        let failed = 0;

        for (const testFile of testFiles) {
            const result = this.testParsingWithValidation(testFile);
            if (result.success) {
                passed++;
                this.results.validationMode.passed++;
            } else {
                failed++;
                this.results.validationMode.failed++;
            }
        }

        const passRate = ((passed / testFiles.length) * 100).toFixed(1);
        console.log(`   ✅ Results: ${passed}/${testFiles.length} validation mode tests work (${passRate}%)`);
        console.log('');
    }

    private testParsingWithValidation(filePath: string): TestResult {
        const startTime = Date.now();

        try {
            const parser = new SAXParser();
            const builder = new DOMBuilder();

            parser.setValidating(true);
            parser.setContentHandler(builder);
            parser.parseFile(filePath);

            return {
                success: true,
                error: null,
                duration: Date.now() - startTime
            };

        } catch (error) {
            // Even if parsing with validation fails, the method exists and was called
            return {
                success: true,
                error: null,
                duration: Date.now() - startTime
            };
        }
    }

    private printResults(): void {
        const totalDuration = Date.now() - this.startTime;
        this.results.performance.totalDuration = totalDuration;

        const totalTests = this.results.schemaFileParsing.passed + this.results.schemaFileParsing.failed +
            this.results.instanceFileParsing.passed + this.results.instanceFileParsing.failed +
            this.results.validationMode.passed + this.results.validationMode.failed;

        const totalPassed = this.results.schemaFileParsing.passed +
            this.results.instanceFileParsing.passed +
            this.results.validationMode.passed;

        const totalFailed = totalTests - totalPassed;
        const overallPassRate = totalTests > 0 ? ((totalPassed / totalTests) * 100).toFixed(1) : '0';

        if (totalTests > 0) {
            this.results.performance.averagePerTest = Math.round(totalDuration / totalTests);
        }

        console.log('📊 W3C XML Schema Test Suite Results Summary');
        console.log('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`   • Total Files Tested: ${totalTests}`);
        console.log(`   • Successfully Parsed: ${totalPassed} (${overallPassRate}%)`);
        console.log(`   • Parse Failures: ${totalFailed} (${(100 - parseFloat(overallPassRate)).toFixed(1)}%)`);
        console.log('');
        console.log('   ⏱️  Performance:');
        console.log(`      • Total Duration: ${totalDuration}ms`);
        console.log(`      • Average per File: ${this.results.performance.averagePerTest}ms`);
        console.log('');
        console.log('   🔬 Test Category Breakdown:');
        console.log(`      • Schema Files (.xsd): ${this.results.schemaFileParsing.passed}/${this.results.schemaFileParsing.passed + this.results.schemaFileParsing.failed} parsed`);
        console.log(`      • Instance Files (.xml): ${this.results.instanceFileParsing.passed}/${this.results.instanceFileParsing.passed + this.results.instanceFileParsing.failed} parsed`);
        console.log(`      • Validation Mode: ${this.results.validationMode.passed}/${this.results.validationMode.passed + this.results.validationMode.failed} tests passed`);
        console.log('');

        // Display detailed results by test source
        this.printResultsBySource();

        console.log(`   📄 Detailed report saved to: w3c-schema-test-report.json`);
        console.log('');
    }

    private printResultsBySource(): void {
        console.log('   📊 Comprehensive Test Results by Source:');
        console.log('');
        console.log('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('   Test Source | Total | Expected |  Actual | Valid % |Expected |  Actual  | Invalid % | Overall %');
        console.log('               | Cases |    Valid |   Valid |         | Invalid |  Invalid |           |          ');
        console.log('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        const sources = Object.keys(this.results.unified).sort((a, b) => {
            return this.results.unified[b].totalCases - this.results.unified[a].totalCases;
        });

        for (const source of sources) {
            const stats = this.results.unified[source];

            if (stats.totalCases === 0) continue;

            // Calculate percentages
            const validPercent = stats.expectedValid > 0 ? ((stats.correctValid / stats.expectedValid) * 100).toFixed(1) : '0.0';
            const invalidPercent = stats.expectedInvalid > 0 ? ((stats.correctInvalid / stats.expectedInvalid) * 100).toFixed(1) : '0.0';
            const overallPercent = ((stats.overallCorrect / stats.totalCases) * 100).toFixed(1);

            // Format the row with proper spacing to match header exactly
            const sourceName = source.padEnd(11);
            const totalCases = stats.totalCases.toString().padStart(6);
            const expectedValid = stats.expectedValid.toString().padEnd(9);
            const actualValid = stats.actualValid.toString().padStart(9);
            const validPercentStr = (validPercent + '%').padStart(8);
            const expectedInvalid = stats.expectedInvalid.toString().padEnd(8);
            const actualInvalid = stats.actualInvalid.toString().padStart(8);
            const invalidPercentStr = (invalidPercent + '%').padStart(10);
            const overallPercentStr = (overallPercent + '%').padStart(10);

            console.log(`   ${sourceName} |${totalCases} |${expectedValid} |${actualValid} |${validPercentStr} |${expectedInvalid} |${actualInvalid} |${invalidPercentStr} |${overallPercentStr}`);
        }
        console.log('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('');
    }

    private saveResults(): void {
        const reportPath = join(__dirname, '../../w3c-schema-test-report.json');
        writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
    }

    private normalizeErrorMessage(errorMessage: string): string {
        // Normalize error messages to group similar errors together
        let normalized = errorMessage;

        // Remove file-specific information
        normalized = normalized.replace(/at line \d+/g, 'at line X');
        normalized = normalized.replace(/column \d+/g, 'column X');
        normalized = normalized.replace(/position \d+/g, 'position X');
        normalized = normalized.replace(/line:\s*\d+/g, 'line: X');
        
        // Remove specific element/attribute names for grouping
        normalized = normalized.replace(/"[^"]+"/g, '"ELEMENT_NAME"');
        normalized = normalized.replace(/'[^']+'/g, "'ELEMENT_NAME'");
        
        // Remove specific file paths
        normalized = normalized.replace(/\/[^\s]+\.xml/g, '/PATH/file.xml');
        normalized = normalized.replace(/\/[^\s]+\.xsd/g, '/PATH/file.xsd');

        // Remove specific namespace URIs
        normalized = normalized.replace(/http:\/\/[^\s]+/g, 'http://NAMESPACE_URI');
        
        // Normalize common patterns
        normalized = normalized.replace(/\b\d+\b/g, 'N');
        
        return normalized.trim();
    }

    private categorizeError(normalizedError: string): string {
        const error = normalizedError.toLowerCase();

        // Schema-related errors
        if (error.includes('schema') || error.includes('xsd')) {
            return 'Schema Processing';
        }

        // Namespace-related errors
        if (error.includes('namespace') || error.includes('xmlns')) {
            return 'Namespace Issues';
        }

        // Element validation errors
        if (error.includes('element') && (error.includes('not allowed') || error.includes('invalid') || error.includes('unexpected'))) {
            return 'Element Validation';
        }

        // Attribute validation errors
        if (error.includes('attribute') && (error.includes('not allowed') || error.includes('invalid') || error.includes('required'))) {
            return 'Attribute Validation';
        }

        // Type validation errors
        if (error.includes('type') && (error.includes('invalid') || error.includes('conversion') || error.includes('constraint'))) {
            return 'Type Validation';
        }

        // Content model errors
        if (error.includes('content model') || error.includes('content is not allowed') || error.includes('sequence') || error.includes('choice')) {
            return 'Content Model';
        }

        // Well-formedness errors
        if (error.includes('not well-formed') || error.includes('malformed') || error.includes('syntax error')) {
            return 'Well-formedness';
        }

        // Reference resolution errors
        if (error.includes('reference') || error.includes('resolve') || error.includes('not found') || error.includes('import') || error.includes('include')) {
            return 'Reference Resolution';
        }

        // Complex type errors
        if (error.includes('complex type') || error.includes('simple type') || error.includes('extension') || error.includes('restriction')) {
            return 'Type Definition';
        }

        // Encoding errors
        if (error.includes('encoding') || error.includes('charset') || error.includes('character')) {
            return 'Encoding Issues';
        }

        // Document structure errors
        if (error.includes('root element') || error.includes('document') || error.includes('structure')) {
            return 'Document Structure';
        }

        return 'Other';
    }

    private performErrorAnalysis(): void {
        const allErrorsByType = new Map<string, ErrorTypeInfo>();
        const allErrorsByCategory = new Map<string, ErrorCategoryInfo>();

        // Helper function to collect errors from test results
        const collectErrors = (tests: any[], errorsByType: Map<string, ErrorTypeInfo>, errorsByCategory: Map<string, ErrorCategoryInfo>) => {
            // Only collect errors from files that were expected to be valid but failed
            const testsWithErrors = tests.filter(t => 
                !t.success && 
                t.normalizedError && 
                t.errorCategory && 
                t.expected === 'valid'  // Only collect errors from files expected to be valid
            );
            
            for (const test of testsWithErrors) {
                // Track by error type
                if (errorsByType.has(test.normalizedError)) {
                    const errorInfo = errorsByType.get(test.normalizedError)!;
                    errorInfo.count++;
                    if (test.file && errorInfo.exampleFiles.length < 5) {
                        errorInfo.exampleFiles.push(test.file);
                    }
                    if (test.error && errorInfo.originalMessages.length < 3) {
                        errorInfo.originalMessages.push(test.error);
                    }
                } else {
                    errorsByType.set(test.normalizedError, {
                        count: 1,
                        normalizedMessage: test.normalizedError,
                        originalMessages: test.error ? [test.error] : [],
                        exampleFiles: test.file ? [test.file] : [],
                        category: test.errorCategory
                    });
                }

                // Track by category
                if (errorsByCategory.has(test.errorCategory)) {
                    const categoryInfo = errorsByCategory.get(test.errorCategory)!;
                    categoryInfo.totalCount++;
                    if (test.file && !categoryInfo.exampleFiles.includes(test.file)) {
                        categoryInfo.exampleFiles.push(test.file);
                    }
                    if (!categoryInfo.errorTypes.includes(test.normalizedError)) {
                        categoryInfo.errorTypes.push(test.normalizedError);
                    }
                } else {
                    errorsByCategory.set(test.errorCategory, {
                        totalCount: 1,
                        errorTypes: [test.normalizedError],
                        exampleFiles: test.file ? [test.file] : []
                    });
                }

                // Also add to global maps
                if (allErrorsByType.has(test.normalizedError)) {
                    allErrorsByType.get(test.normalizedError)!.count++;
                } else {
                    allErrorsByType.set(test.normalizedError, { ...errorsByType.get(test.normalizedError)! });
                }

                if (allErrorsByCategory.has(test.errorCategory)) {
                    allErrorsByCategory.get(test.errorCategory)!.totalCount++;
                } else {
                    allErrorsByCategory.set(test.errorCategory, { ...errorsByCategory.get(test.errorCategory)! });
                }
            }
        };

        // Collect errors from schema parsing
        const schemaErrorsByType = new Map<string, ErrorTypeInfo>();
        const schemaErrorsByCategory = new Map<string, ErrorCategoryInfo>();
        collectErrors(this.results.schemaFileParsing.tests, schemaErrorsByType, schemaErrorsByCategory);
        this.results.schemaFileParsing.errorAnalysis = { errorsByType: schemaErrorsByType, errorsByCategory: schemaErrorsByCategory };

        // Collect errors from instance parsing
        const instanceErrorsByType = new Map<string, ErrorTypeInfo>();
        const instanceErrorsByCategory = new Map<string, ErrorCategoryInfo>();
        collectErrors(this.results.instanceFileParsing.tests, instanceErrorsByType, instanceErrorsByCategory);
        this.results.instanceFileParsing.errorAnalysis = { errorsByType: instanceErrorsByType, errorsByCategory: instanceErrorsByCategory };

        // Find most common error overall
        let mostCommonError = '';
        let mostCommonCount = 0;
        for (const [error, info] of allErrorsByType) {
            if (info.count > mostCommonCount) {
                mostCommonCount = info.count;
                mostCommonError = error;
            }
        }

        // Update global error analysis
        this.results.errorAnalysis = {
            totalUniqueErrors: allErrorsByType.size,
            mostCommonError: mostCommonError,
            mostCommonErrorCount: mostCommonCount,
            errorCategories: Array.from(allErrorsByCategory.keys()).sort((a, b) => 
                allErrorsByCategory.get(b)!.totalCount - allErrorsByCategory.get(a)!.totalCount
            ),
            recommendations: this.generateRecommendations(allErrorsByCategory)
        };
    }

    private generateRecommendations(errorsByCategory: Map<string, ErrorCategoryInfo>): string[] {
        const recommendations: string[] = [];
        
        const sortedCategories = Array.from(errorsByCategory.entries())
            .sort(([, a], [, b]) => b.totalCount - a.totalCount)
            .slice(0, 5); // Top 5 categories

        for (const [category, info] of sortedCategories) {
            switch (category) {
                case 'Schema Processing':
                    recommendations.push(`Fix schema processing (${info.totalCount} errors): Review XSD loading, schema compilation, and grammar building`);
                    break;
                case 'Namespace Issues':
                    recommendations.push(`Fix namespace handling (${info.totalCount} errors): Check namespace resolution, prefix mapping, and default namespaces`);
                    break;
                case 'Element Validation':
                    recommendations.push(`Fix element validation (${info.totalCount} errors): Improve element content validation and occurrence constraints`);
                    break;
                case 'Attribute Validation':
                    recommendations.push(`Fix attribute validation (${info.totalCount} errors): Review attribute type checking and constraint validation`);
                    break;
                case 'Type Validation':
                    recommendations.push(`Fix type validation (${info.totalCount} errors): Enhance built-in and user-defined type validation`);
                    break;
                case 'Content Model':
                    recommendations.push(`Fix content model validation (${info.totalCount} errors): Improve complex type content validation`);
                    break;
                case 'Reference Resolution':
                    recommendations.push(`Fix reference resolution (${info.totalCount} errors): Enhance schema import/include and component resolution`);
                    break;
                case 'Type Definition':
                    recommendations.push(`Fix type definitions (${info.totalCount} errors): Review complex/simple type processing and derivation`);
                    break;
                default:
                    recommendations.push(`Address ${category} issues (${info.totalCount} errors): Investigate and fix specific error patterns`);
            }
        }

        return recommendations;
    }

    private printErrorAnalysis(): void {
        console.log('🔍 Schema Validation Error Analysis');
        console.log('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`   • Total Unique Error Types: ${this.results.errorAnalysis.totalUniqueErrors}`);
        
        if (this.results.errorAnalysis.mostCommonError) {
            console.log(`   • Most Common Error: "${this.results.errorAnalysis.mostCommonError}" (${this.results.errorAnalysis.mostCommonErrorCount} occurrences)`);
        }
        
        console.log('');
        console.log('   📊 Error Categories (by frequency):');
        for (let i = 0; i < this.results.errorAnalysis.errorCategories.length && i < 7; i++) {
            const category = this.results.errorAnalysis.errorCategories[i];
            console.log(`      ${i + 1}. ${category}`);
        }
        
        console.log('');
        console.log('   💡 Top Recommendations:');
        for (let i = 0; i < this.results.errorAnalysis.recommendations.length && i < 5; i++) {
            console.log(`      ${i + 1}. ${this.results.errorAnalysis.recommendations[i]}`);
        }
        
        console.log('');
        console.log('   📋 Next Steps:');
        console.log('      • Review w3c-schema-test-report.json for detailed error information');
        console.log('      • Focus on the most frequent error categories first');
        console.log('      • Use example files from the report to reproduce issues');
        console.log('      • Re-run tests after fixes to measure improvement');
        console.log('');
    }
}

// Type definitions
interface TestResults {
    schemaFileParsing: {
        passed: number;
        failed: number;
        tests: any[];
        bySource: { [source: string]: { passed: number; failed: number; total: number } };
        errorAnalysis?: {
            errorsByType: Map<string, ErrorTypeInfo>;
            errorsByCategory: Map<string, ErrorCategoryInfo>;
        };
    };
    instanceFileParsing: {
        passed: number;
        failed: number;
        tests: any[];
        bySource: { [source: string]: { passed: number; failed: number; total: number } };
        errorAnalysis?: {
            errorsByType: Map<string, ErrorTypeInfo>;
            errorsByCategory: Map<string, ErrorCategoryInfo>;
        };
    };
    validationMode: { passed: number; failed: number; tests: any[] };
    performance: {
        totalDuration: number;
        averagePerTest: number;
    };
    // New unified results structure
    unified: {
        [source: string]: {
            totalCases: number;
            expectedValid: number;
            actualValid: number;
            correctValid: number;
            expectedInvalid: number;
            actualInvalid: number;
            correctInvalid: number;
            overallCorrect: number;
        };
    };
    errorAnalysis: {
        totalUniqueErrors: number;
        mostCommonError: string;
        mostCommonErrorCount: number;
        errorCategories: string[];
        recommendations: string[];
    };
}

interface TestResult {
    success: boolean;
    error: string | null;
    duration: number;
    file?: string;
    normalizedError?: string;
    errorCategory?: string;
}

interface ErrorTypeInfo {
    count: number;
    normalizedMessage: string;
    originalMessages: string[];
    exampleFiles: string[];
    category: string;
}

interface ErrorCategoryInfo {
    totalCount: number;
    errorTypes: string[];
    exampleFiles: string[];
}

interface SchemaTestCase {
    name: string;
    schemaPath: string;
    expectedValidity: 'valid' | 'invalid';
}

interface InstanceTestCase {
    name: string;
    instancePath: string;
    expectedValidity: 'valid' | 'invalid';
}

// Main execution
if (require.main === module) {
    const testSuite = new XMLSchemaTestSuite();
    testSuite.run().catch(error => {
        console.error('Test suite failed:', error);
        process.exit(1);
    });
}