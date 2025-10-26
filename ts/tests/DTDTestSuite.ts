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

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, Stats } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import { DOMBuilder } from '../DOMBuilder';
import { SAXParser } from '../SAXParser';
import { XMLCanonicalizer } from '../XMLCanonicalizer';

/**
 * W3C XML Test Suite Runner for TypesXML v2.0.0
 * 
 * This test suite validates TypesXML's XML parsing capabilities
 * using the W3C XML Test Suite from the xmltest directory.
 * 
 * Test Categories:
 * - Valid XML Tests: Can TypesXML parse valid XML documents?
 * - Invalid XML Tests: How does TypesXML handle invalid XML documents?
 * - Well-formed Tests: Can TypesXML parse well-formed XML without DTDs?
 * - Not Well-formed Tests: Does TypesXML reject malformed XML?
 */
export class DTDTestSuite {
    private startTime: number;
    private results: DTDTestResults;
    private xmlTestPath: string;

    constructor() {
        this.startTime = Date.now();
        this.xmlTestPath = resolve(__dirname, '../../tests/xmltest');
        this.results = {
            validXML: { passed: 0, failed: 0, tests: [] },
            invalidXML: { passed: 0, failed: 0, tests: [] },
            notWellFormed: { passed: 0, failed: 0, tests: [] },
            performance: {
                totalDuration: 0,
                averagePerTest: 0
            },
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

        // Run XML tests using W3C XML Test Suite
        this.testValidXMLDocuments();
        this.testInvalidXMLDocuments();
        this.testNotWellFormedDocuments();

        // Print final results
        this.printResults();
        this.printCanonicalFormFailures();
        
        // Perform error analysis
        this.performErrorAnalysis();
        this.printErrorAnalysis();
        
        this.saveResults();
    }

    private printHeader(): void {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('                 W3C XML Test Suite File Parser                      ');
        console.log('');
        console.log('  Testing TypesXML v2.0.0 with W3C XML Test Files                   ');
        console.log('  Parsing real XML files from xmltest directory                      ');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('');
    }

    private async validateTestSuite(): Promise<void> {
        console.log('🔍 Validating W3C XML Test Suite...');

        if (!existsSync(this.xmlTestPath)) {
            console.log(`❌ W3C XML Test Suite not found at: ${this.xmlTestPath}`);
            console.log('   Please ensure the xmltest directory exists in /tests');
            throw new Error('Test suite not available');
        }

        const validFiles: number = this.countFilesInDir(join(this.xmlTestPath, 'valid'));
        const invalidFiles: number = this.countFilesInDir(join(this.xmlTestPath, 'invalid'));
        const notWfFiles: number = this.countFilesInDir(join(this.xmlTestPath, 'not-wf'));

        console.log(`✅ Found ${validFiles} files in valid/ directory`);
        console.log(`✅ Found ${invalidFiles} files in invalid/ directory`);
        console.log(`✅ Found ${notWfFiles} files in not-wf/ directory`);
        console.log('✅ Test suite validation complete');
        console.log('');
    }

    private countFilesInDir(dirPath: string): number {
        try {
            if (!existsSync(dirPath)) return 0;

            let count: number = 0;
            const entries: string[] = readdirSync(dirPath);

            for (const entry of entries) {
                const fullPath: string = join(dirPath, entry);
                const stat: Stats = statSync(fullPath);

                if (stat.isFile() && entry.endsWith('.xml')) {
                    count++;
                } else if (stat.isDirectory()) {
                    // Recursively count files in subdirectories
                    count += this.countFilesInDir(fullPath);
                }
            }

            return count;
        } catch (error) {
            return 0;
        }
    }

    private testValidXMLDocuments(): void {
        console.log('📋 Test 1: Valid XML Documents');
        console.log('   Testing: Can SAXParser parse valid XML files from xmltest/valid/ with validation enabled?');
        console.log('   Note: Also validates canonical form output against expected results in /out directories');

        // Test files from valid/sa (standalone with internal DTD)
        const validSaDir: string = join(this.xmlTestPath, 'valid', 'sa');
        console.log('   Testing standalone valid files...');
        this.testValidFilesInDirectory(validSaDir);

        // Test files from valid/ext-sa (external standalone DTD)
        const validExtSaDir: string = join(this.xmlTestPath, 'valid', 'ext-sa');
        console.log('   Testing external standalone valid files...');
        this.testValidFilesInDirectory(validExtSaDir);

        // Test files from valid/not-sa (not standalone DTD)
        const validNotSaDir: string = join(this.xmlTestPath, 'valid', 'not-sa');
        console.log('   Testing not standalone valid files...');
        this.testValidFilesInDirectory(validNotSaDir);
    }

    private testInvalidXMLDocuments(): void {
        console.log('📋 Test 2: Invalid XML Documents');
        console.log('   Testing: How does SAXParser handle invalid XML files from xmltest/invalid/ with validation?');
        console.log('   Note: These are well-formed XML but DTD-invalid (expected to fail validation)');

        // Test all files in invalid/ directory (no subdirectories)
        const invalidDir: string = join(this.xmlTestPath, 'invalid');
        this.testFilesInDirectory(invalidDir, 'invalidXML', Number.MAX_SAFE_INTEGER, false); // Test all files with validation enabled
    }

    private testNotWellFormedDocuments(): void {
        console.log('📋 Test 3: Not Well-formed XML Documents');
        console.log('   Testing: Does SAXParser properly reject malformed XML files from xmltest/not-wf/ with validation?');

        // Test files from all not-wf subdirectories
        const notWfSaDir: string = join(this.xmlTestPath, 'not-wf', 'sa');
        const notWfExtSaDir: string = join(this.xmlTestPath, 'not-wf', 'ext-sa');
        const notWfNotSaDir: string = join(this.xmlTestPath, 'not-wf', 'not-sa');

        console.log('   Testing standalone not well-formed files...');
        this.testFilesInDirectory(notWfSaDir, 'notWellFormed', Number.MAX_SAFE_INTEGER, false);

        console.log('   Testing external standalone not well-formed files...');
        this.testFilesInDirectory(notWfExtSaDir, 'notWellFormed', Number.MAX_SAFE_INTEGER, false);

        console.log('   Testing not standalone not well-formed files...');
        this.testFilesInDirectory(notWfNotSaDir, 'notWellFormed', Number.MAX_SAFE_INTEGER, false);
    }

    private getAllXmlFiles(dirPath: string): string[] {
        if (!existsSync(dirPath)) {
            return [];
        }

        const xmlFiles: string[] = [];

        const traverse = (currentPath: string): void => {
            const items = readdirSync(currentPath, { withFileTypes: true });

            for (const item of items) {
                const fullPath = join(currentPath, item.name);

                if (item.isDirectory()) {
                    // Skip /out directories (they contain canonical forms, not test files)
                    if (item.name !== 'out') {
                        traverse(fullPath);
                    }
                } else if (item.isFile() && item.name.endsWith('.xml')) {
                    xmlFiles.push(fullPath);
                }
            }
        };

        traverse(dirPath);
        return xmlFiles.sort();
    }

    private testValidFilesInDirectory(testDir: string): void {
        if (!existsSync(testDir)) {
            console.log(`   ⚠️  Directory not found: ${testDir}`);
            console.log('   ✅ Results: 0/0 files tested (N/A)');
            console.log('');
            return;
        }

        const xmlFiles: string[] = this.getAllXmlFiles(testDir).filter(file => !file.includes('/out/'));
        const outDir = join(testDir, 'out');

        let passed: number = 0;
        let failed: number = 0;

        console.log(`   Testing ${xmlFiles.length} XML files...`);

        for (let i: number = 0; i < xmlFiles.length; i++) {
            const filePath: string = xmlFiles[i];
            const filename = basename(filePath);
            const expectedCanonicalFile = join(outDir, filename);

            let testPassed = false;

            try {
                // First, test if the file can be parsed successfully
                const parseResult = this.testParseFile(filePath, true); // Always use validation for valid XML

                if (!parseResult.success) {
                    // This is a valid file that failed to parse - collect the error for analysis
                    if (parseResult.error) {
                        this.results.validXML.tests.push(parseResult);
                    }
                    failed++;
                    continue;
                }

                // If parsing succeeded, test canonical form (if expected canonical file exists)
                if (existsSync(expectedCanonicalFile)) {
                    // Parse again to get the document for canonicalization
                    const parser = new SAXParser();
                    const domBuilder = new DOMBuilder();
                    parser.setValidating(true);
                    parser.setContentHandler(domBuilder);

                    const originalCwd = process.cwd();
                    const xmlDir = dirname(filePath);
                    const xmlFileName = basename(filePath);

                    try {
                        process.chdir(xmlDir);
                        parser.parseFile(xmlFileName);
                        const document = domBuilder.getDocument();

                        if (document) {
                            // Generate canonical form
                            const actualCanonical = XMLCanonicalizer.canonicalize(document);

                            // Read expected canonical form
                            const expectedCanonical = readFileSync(expectedCanonicalFile, 'utf8').trim();

                            // Compare canonical forms
                            if (actualCanonical.trim() === expectedCanonical) {
                                testPassed = true;
                            } else {
                                console.log(`   ❌ Canonical form mismatch: ${filename}`);
                                // Track failed canonical form files for detailed analysis
                                this.results.validXML.tests.push({
                                    file: filename,
                                    success: false,
                                    error: 'Canonical form mismatch',
                                    duration: 0
                                });
                            }
                        }
                    } finally {
                        process.chdir(originalCwd);
                    }
                } else {
                    // No canonical form to check, just count parsing success
                    testPassed = true;
                }

            } catch (error) {
                console.log(`   ❌ Error processing ${filename}: ${error}`);
            }

            if (testPassed) {
                passed++;
            } else {
                failed++;
            }

            // Progress indicator every 5 files
            if ((i + 1) % 5 === 0 || i === xmlFiles.length - 1) {
                const progress: string = ((i + 1) / xmlFiles.length * 100).toFixed(0);
                console.log(`   Progress: ${progress}% (${i + 1}/${xmlFiles.length}) - ${passed} passed, ${failed} failed`);
            }
        }

        // Update results
        this.results.validXML.passed += passed;
        this.results.validXML.failed += failed;

        const passRate: string = xmlFiles.length > 0 ? ((passed / xmlFiles.length) * 100).toFixed(1) : '0';
        console.log(`   ✅ Results: ${passed}/${xmlFiles.length} files processed successfully (${passRate}%)`);
        console.log('');
    }

    private testFilesInDirectory(dirPath: string, resultCategory: keyof DTDTestResults, maxFiles: number, skipValidation = false): void {
        if (!existsSync(dirPath)) {
            console.log(`   ⚠️  Directory not found: ${dirPath}`);
            console.log('   ✅ Results: 0/0 files tested (N/A)');
            console.log('');
            return;
        }

        const xmlFiles: string[] = this.getAllXmlFiles(dirPath).slice(0, maxFiles);

        let passed: number = 0;
        let failed: number = 0;

        console.log(`   Testing ${xmlFiles.length} XML files...`);

        for (let i: number = 0; i < xmlFiles.length; i++) {
            const filePath: string = xmlFiles[i]; // xmlFiles now contains full paths
            const result: DTDTestResult = this.testParseFile(filePath, !skipValidation);

            // Determine if this is the expected result based on test category
            let expectedToPass: boolean = true;
            if (resultCategory === 'notWellFormed') {
                expectedToPass = false; // Not well-formed files should fail to parse
            }
            // invalidXML files are well-formed but DTD-invalid, so they should parse as XML

            const testPassed: boolean = (result.success === expectedToPass);

            // Only collect errors from files that are supposed to be valid (validXML category)
            // and from files that failed when they should have passed
            if (resultCategory === 'validXML' && !result.success && result.error) {
                // This is a valid file that failed to parse - collect the error for analysis
                (this.results[resultCategory] as DTDTestCategoryResult).tests.push(result);
            }

            if (testPassed) {
                passed++;
                (this.results[resultCategory] as DTDTestCategoryResult).passed++;
            } else {
                failed++;
                (this.results[resultCategory] as DTDTestCategoryResult).failed++;
                
                // Log incorrectly accepted not well-formed files
                if (resultCategory === 'notWellFormed' && result.success === true) {
                    const fileName = basename(filePath);
                    console.log(`   ❌ INCORRECTLY ACCEPTED: ${fileName}`);
                }
            }

            // Progress indicator every 5 files
            if ((i + 1) % 5 === 0 || i === xmlFiles.length - 1) {
                const progress: string = ((i + 1) / xmlFiles.length * 100).toFixed(0);
                console.log(`   Progress: ${progress}% (${i + 1}/${xmlFiles.length}) - ${passed} passed, ${failed} failed`);
            }
        }

        const passRate: string = xmlFiles.length > 0 ? ((passed / xmlFiles.length) * 100).toFixed(1) : '0';
        console.log(`   ✅ Results: ${passed}/${xmlFiles.length} files processed successfully (${passRate}%)`);
        console.log('');
    }

    private testParseFile(filePath: string, enableValidation: boolean): DTDTestResult {
        const startTime: number = Date.now();

        try {
            const parser: SAXParser = new SAXParser();
            const builder: DOMBuilder = new DOMBuilder();

            if (enableValidation) {
                parser.setValidating(true);
            }
            parser.setContentHandler(builder);

            // Change working directory temporarily to help resolve relative DTD references
            const originalDir = process.cwd();
            const xmlDir = dirname(filePath);
            const xmlFileName = basename(filePath);

            try {
                process.chdir(xmlDir);
                parser.parseFile(xmlFileName); // Use relative path from the XML directory
            } finally {
                process.chdir(originalDir);
            }

            const document = builder.getDocument();
            if (!document || !document.getRoot()) {
                return {
                    success: false,
                    error: 'No root element found in parsed document',
                    duration: Date.now() - startTime,
                    file: basename(filePath),
                    normalizedError: 'No root element found',
                    errorCategory: 'Document Structure'
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

    private printResults(): void {
        const totalDuration: number = Date.now() - this.startTime;
        this.results.performance.totalDuration = totalDuration;

        const totalTests: number = this.results.validXML.passed + this.results.validXML.failed +
            this.results.invalidXML.passed + this.results.invalidXML.failed +
            this.results.notWellFormed.passed + this.results.notWellFormed.failed;

        const totalPassed: number = this.results.validXML.passed +
            this.results.invalidXML.passed +
            this.results.notWellFormed.passed;

        const totalFailed: number = totalTests - totalPassed;
        const overallPassRate: string = totalTests > 0 ? ((totalPassed / totalTests) * 100).toFixed(1) : '0';

        if (totalTests > 0) {
            this.results.performance.averagePerTest = Math.round(totalDuration / totalTests);
        }

        console.log('📊 W3C XML Test Suite Results Summary');
        console.log('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`   • Total Files Tested: ${totalTests}`);
        console.log(`   • Successfully Processed: ${totalPassed} (${overallPassRate}%)`);
        console.log(`   • Processing Failures: ${totalFailed} (${(100 - parseFloat(overallPassRate)).toFixed(1)}%)`);
        console.log('');
        console.log('   ⏱️  Performance:');
        console.log(`      • Total Duration: ${totalDuration}ms`);
        console.log(`      • Average per File: ${this.results.performance.averagePerTest}ms`);
        console.log('');

        this.printDetailedResults();

        console.log('   � Detailed report saved to: dtd-test-report.json');
        console.log('');
    }

    private printDetailedResults(): void {
        console.log('   📊 Comprehensive Test Results by Dataset:');
        console.log('');
        console.log('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('   Dataset       | Total | Expected | Actual  | Success | Expected | Actual  | Failure | Overall |');
        console.log('                 | Cases | Success  | Success | Rate %  | Failure  | Failure | Rate %  | Rate %  |');
        console.log('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        // Valid XML documents (should succeed)
        const validTotal = this.results.validXML.passed + this.results.validXML.failed;
        const validExpectedSuccess = validTotal;
        const validActualSuccess = this.results.validXML.passed;
        const validSuccessRate = validTotal > 0 ? ((validActualSuccess / validExpectedSuccess) * 100).toFixed(1) : '0.0';
        const validExpectedFailure = 0;
        const validActualFailure = this.results.validXML.failed;
        const validFailureRate = validExpectedFailure > 0 ? ((validActualFailure / validExpectedFailure) * 100).toFixed(1) : (validActualFailure > 0 ? '100.0' : '0.0');
        const validOverallRate = validTotal > 0 ? ((validActualSuccess / validTotal) * 100).toFixed(1) : '0.0';

        console.log(`   Valid         | ${validTotal.toString().padStart(5)} | ${validExpectedSuccess.toString().padStart(8)} | ${validActualSuccess.toString().padStart(7)} | ${validSuccessRate.padStart(7)} | ${validExpectedFailure.toString().padStart(8)} | ${validActualFailure.toString().padStart(7)} | ${validFailureRate.padStart(7)} | ${validOverallRate.padStart(7)} |`);

        // Invalid XML documents (should fail DTD validation - they are DTD-invalid!)
        const invalidTotal = this.results.invalidXML.passed + this.results.invalidXML.failed;
        const invalidExpectedSuccess = 0; // Should not pass DTD validation (they are DTD-invalid)
        const invalidActualSuccess = this.results.invalidXML.passed;
        const invalidSuccessRate = invalidExpectedSuccess > 0 ? ((invalidActualSuccess / invalidExpectedSuccess) * 100).toFixed(1) : (invalidActualSuccess > 0 ? '100.0' : '0.0');
        const invalidExpectedFailure = invalidTotal; // Should fail DTD validation (they are DTD-invalid)
        const invalidActualFailure = this.results.invalidXML.failed;
        const invalidFailureRate = invalidTotal > 0 ? ((invalidActualFailure / invalidExpectedFailure) * 100).toFixed(1) : '0.0';
        const invalidOverallRate = invalidTotal > 0 ? ((invalidActualFailure / invalidTotal) * 100).toFixed(1) : '0.0'; // For invalid, success means proper validation failure

        console.log(`   Invalid       | ${invalidTotal.toString().padStart(5)} | ${invalidExpectedSuccess.toString().padStart(8)} | ${invalidActualSuccess.toString().padStart(7)} | ${invalidSuccessRate.padStart(7)} | ${invalidExpectedFailure.toString().padStart(8)} | ${invalidActualFailure.toString().padStart(7)} | ${invalidFailureRate.padStart(7)} | ${invalidOverallRate.padStart(7)} |`);

        // Not well-formed XML documents (should fail)
        const notWfTotal = this.results.notWellFormed.passed + this.results.notWellFormed.failed;
        const notWfExpectedSuccess = 0; // Should not succeed
        const notWfActualSuccess = this.results.notWellFormed.passed;
        const notWfSuccessRate = notWfExpectedSuccess > 0 ? ((notWfActualSuccess / notWfExpectedSuccess) * 100).toFixed(1) : (notWfActualSuccess > 0 ? '100.0' : '0.0');
        const notWfExpectedFailure = notWfTotal; // Should all fail
        const notWfActualFailure = this.results.notWellFormed.failed;
        const notWfFailureRate = notWfTotal > 0 ? ((notWfActualFailure / notWfExpectedFailure) * 100).toFixed(1) : '0.0';
        const notWfOverallRate = notWfTotal > 0 ? ((notWfActualFailure / notWfTotal) * 100).toFixed(1) : '0.0'; // For not-wf, success means proper failure

        console.log(`   Not-Well-Frmd | ${notWfTotal.toString().padStart(5)} | ${notWfExpectedSuccess.toString().padStart(8)} | ${notWfActualSuccess.toString().padStart(7)} | ${notWfSuccessRate.padStart(7)} | ${notWfExpectedFailure.toString().padStart(8)} | ${notWfActualFailure.toString().padStart(7)} | ${notWfFailureRate.padStart(7)} | ${notWfOverallRate.padStart(7)} |`);

        console.log('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('');
    }

    private printCanonicalFormFailures(): void {
        const canonicalFailures = this.results.validXML.tests.filter(test =>
            test.error === 'Canonical form mismatch'
        );

        if (canonicalFailures.length === 0) {
            console.log('🎉 All valid XML files passed canonical form validation!');
            return;
        }

        console.log('');
        console.log('📋 Canonical Form Failures Analysis');
        console.log('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`   Found ${canonicalFailures.length} files with canonical form mismatches:`);
        console.log('');

        // Group by directory for better organization
        const failuresByDir: { [key: string]: string[] } = {};
        canonicalFailures.forEach(failure => {
            if (failure.file) {
                // Determine directory based on which test was running
                const dir = 'valid'; // We know these are all from valid XML tests
                if (!failuresByDir[dir]) failuresByDir[dir] = [];
                failuresByDir[dir].push(failure.file);
            }
        });

        for (const [dir, files] of Object.entries(failuresByDir)) {
            console.log(`   📁 ${dir}/ directory (${files.length} files):`);
            files.forEach(file => {
                console.log(`      • ${file}`);
            });
            console.log('');
        }

        console.log('   💡 To analyze these failures:');
        console.log('      1. Check specific files manually');
        console.log('      2. Compare actual vs expected canonical forms');
        console.log('      3. Identify patterns in canonicalizer behavior');
        console.log('');
    }

    private saveResults(): void {
        const reportPath: string = join(__dirname, '../../dtd-test-report.json');
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
        normalized = normalized.replace(/\/[^\s]+\.dtd/g, '/PATH/file.dtd');

        // Normalize common patterns
        normalized = normalized.replace(/\b\d+\b/g, 'N');
        
        return normalized.trim();
    }

    private categorizeError(normalizedError: string): string {
        const error = normalizedError.toLowerCase();

        // DTD-related errors
        if (error.includes('dtd') || error.includes('doctype')) {
            return 'DTD Processing';
        }

        // Element validation errors
        if (error.includes('element') && (error.includes('not allowed') || error.includes('invalid') || error.includes('unexpected'))) {
            return 'Element Validation';
        }

        // Attribute validation errors
        if (error.includes('attribute') && (error.includes('not allowed') || error.includes('invalid') || error.includes('required'))) {
            return 'Attribute Validation';
        }

        // Well-formedness errors
        if (error.includes('not well-formed') || error.includes('malformed') || error.includes('syntax error')) {
            return 'Well-formedness';
        }

        // Content model errors
        if (error.includes('content model') || error.includes('content is not allowed')) {
            return 'Content Model';
        }

        // Entity resolution errors
        if (error.includes('entity') || error.includes('reference') || error.includes('resolve')) {
            return 'Entity Resolution';
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
        const errorsByType = new Map<string, ErrorTypeInfo>();
        const errorsByCategory = new Map<string, ErrorCategoryInfo>();

        // Collect only test results from validXML category that have errors
        // These are files that were supposed to be valid but failed to parse
        const allTestsWithErrors = [
            ...this.results.validXML.tests.filter(t => !t.success)
        ];

        // Process each error
        for (const test of allTestsWithErrors) {
            if (!test.normalizedError || !test.errorCategory) continue;

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
        }

        // Find most common error
        let mostCommonError = '';
        let mostCommonCount = 0;
        for (const [error, info] of errorsByType) {
            if (info.count > mostCommonCount) {
                mostCommonCount = info.count;
                mostCommonError = error;
            }
        }

        // Update results with error analysis
        this.results.errorAnalysis = {
            totalUniqueErrors: errorsByType.size,
            mostCommonError: mostCommonError,
            mostCommonErrorCount: mostCommonCount,
            errorCategories: Array.from(errorsByCategory.keys()).sort((a, b) => 
                errorsByCategory.get(b)!.totalCount - errorsByCategory.get(a)!.totalCount
            ),
            recommendations: this.generateRecommendations(errorsByCategory)
        };

        // Add error analysis to each category
        this.results.validXML.errorAnalysis = { errorsByType, errorsByCategory, mostCommonErrors: [] };
        this.results.invalidXML.errorAnalysis = { errorsByType, errorsByCategory, mostCommonErrors: [] };
        this.results.notWellFormed.errorAnalysis = { errorsByType, errorsByCategory, mostCommonErrors: [] };
    }

    private generateRecommendations(errorsByCategory: Map<string, ErrorCategoryInfo>): string[] {
        const recommendations: string[] = [];
        
        const sortedCategories = Array.from(errorsByCategory.entries())
            .sort(([, a], [, b]) => b.totalCount - a.totalCount)
            .slice(0, 5); // Top 5 categories

        for (const [category, info] of sortedCategories) {
            switch (category) {
                case 'DTD Processing':
                    recommendations.push(`Fix DTD parsing (${info.totalCount} errors): Review DTD loading, external entity resolution, and DOCTYPE handling`);
                    break;
                case 'Element Validation':
                    recommendations.push(`Fix element validation (${info.totalCount} errors): Check element content model validation and allowed child elements`);
                    break;
                case 'Attribute Validation':
                    recommendations.push(`Fix attribute validation (${info.totalCount} errors): Review attribute type validation and required attribute checking`);
                    break;
                case 'Well-formedness':
                    recommendations.push(`Fix well-formedness checks (${info.totalCount} errors): Improve basic XML syntax validation`);
                    break;
                case 'Content Model':
                    recommendations.push(`Fix content model validation (${info.totalCount} errors): Improve element sequence and choice validation`);
                    break;
                case 'Entity Resolution':
                    recommendations.push(`Fix entity resolution (${info.totalCount} errors): Review entity reference handling and resolution`);
                    break;
                case 'Document Structure':
                    recommendations.push(`Fix document structure validation (${info.totalCount} errors): Check root element and document parsing`);
                    break;
                default:
                    recommendations.push(`Address ${category} issues (${info.totalCount} errors): Investigate and fix specific error patterns`);
            }
        }

        return recommendations;
    }

    private printErrorAnalysis(): void {
        console.log('');
        console.log('🔍 Error Analysis Results');
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
        console.log('      • Review dtd-test-report.json for detailed error information');
        console.log('      • Focus on the most frequent error categories first');
        console.log('      • Use example files from the report to reproduce issues');
        console.log('      • Re-run tests after fixes to measure improvement');
        console.log('');
    }
}

// Type definitions
interface DTDTestCategoryResult {
    passed: number;
    failed: number;
    tests: DTDTestResult[];
    errorAnalysis?: {
        errorsByType: Map<string, ErrorTypeInfo>;
        errorsByCategory: Map<string, ErrorCategoryInfo>;
        mostCommonErrors: ErrorSummary[];
    };
}

interface DTDTestResults {
    validXML: DTDTestCategoryResult;
    invalidXML: DTDTestCategoryResult;
    notWellFormed: DTDTestCategoryResult;
    performance: {
        totalDuration: number;
        averagePerTest: number;
    };
    errorAnalysis: {
        totalUniqueErrors: number;
        mostCommonError: string;
        mostCommonErrorCount: number;
        errorCategories: string[];
        recommendations: string[];
    };
}

interface DTDTestResult {
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

interface ErrorSummary {
    error: string;
    count: number;
    category: string;
    exampleFiles: string[];
    recommendation: string;
}

// Main execution
if (require.main === module) {
    const testSuite: DTDTestSuite = new DTDTestSuite();
    testSuite.run().catch(error => {
        console.error('DTD test suite failed:', error);
        process.exit(1);
    });
}