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

import { SAXParser } from '../SAXParser';
import { DOMBuilder } from '../DOMBuilder';
import { XMLDocument } from '../XMLDocument';
import { XMLElement } from '../XMLElement';
import { RelaxNGParser } from '../relaxng/RelaxNGParser';
import { RelaxNGComposite } from '../grammar/RelaxNGComposite';
import { GrammarHandler } from '../grammar/GrammarHandler';
import { resolve } from 'path';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

export interface TestCase {
    section: string;
    description?: string;
    isCorrect: boolean;
    schema?: string;
    validInstances: string[];
    invalidInstances: string[];
}

export interface TestResult {
    testCase: TestCase;
    schemaValidationResult: boolean;
    instanceValidationResults: Array<{
        instance: string;
        expected: boolean;
        actual: boolean;
        passed: boolean;
    }>;
    passed: boolean;
    error?: string;
}

export class RelaxNGTestRunner {
    private testSuiteFile: string;
    private outputDir: string;
    private verbose: boolean = false;

    constructor(testSuiteFile: string, outputDir: string = './test-output') {
        this.testSuiteFile = testSuiteFile;
        this.outputDir = outputDir;
    }

    setVerbose(verbose: boolean): void {
        this.verbose = verbose;
    }

    async runTestSuite(): Promise<TestResult[]> {
        const testCases = this.parseTestSuite();
        const results: TestResult[] = [];

        console.log(`Running ${testCases.length} RelaxNG test cases...`);

        for (let i = 0; i < testCases.length; i++) {
            const testCase = testCases[i];

            const result = await this.runTestCase(testCase);
            results.push(result);

            // Show progress every 25 tests
            if ((i + 1) % 25 === 0) {
                const currentPassed = results.filter(r => r.passed).length;
                console.log(`Progress: ${i + 1}/${testCases.length} tests completed (${currentPassed} passed)`);
            }
        }

        this.generateReport(results);
        return results;
    }

    private parseTestSuite(): TestCase[] {
        const parser = new SAXParser();
        const builder = new DOMBuilder();
        parser.setContentHandler(builder);
        
        parser.parseFile(this.testSuiteFile);
        const document = builder.getDocument();
        
        if (!document || !document.getRoot()) {
            throw new Error('Failed to parse test suite document');
        }
        
        return this.extractTestCases(document.getRoot()!);
    }

    private extractTestCases(element: XMLElement, parentSection: string = ''): TestCase[] {
        const testCases: TestCase[] = [];

        // Check if this is a testCase element
        if (element.getName() === 'testCase') {
            const testCase = this.parseTestCase(element, parentSection);
            if (testCase) {
                testCases.push(testCase);
            }
        }

        // Look for section information
        let currentSection = parentSection;
        const sectionElement = element.getChild('section');
        if (sectionElement && sectionElement.getText()) {
            currentSection = sectionElement.getText().trim();
        }

        // Recursively process child elements
        const children = element.getChildren();
        for (const child of children) {
            if (child instanceof XMLElement) {
                testCases.push(...this.extractTestCases(child, currentSection));
            }
        }

        return testCases;
    }

    private parseTestCase(element: XMLElement, section: string): TestCase | null {
        try {
            // Get documentation if available
            const docElement = element.getChild('documentation');
            const description = docElement ? docElement.getText().trim() : undefined;

            // Check if this is a correct or incorrect schema test
            const incorrectElement = element.getChild('incorrect');
            const correctElement = element.getChild('correct');

            let isCorrect: boolean;
            let schema: string | undefined;

            if (incorrectElement) {
                isCorrect = false;
                schema = this.extractSchemaContent(incorrectElement);
            } else if (correctElement) {
                isCorrect = true;
                schema = this.extractSchemaContent(correctElement);
            } else {
                console.warn('Test case has neither correct nor incorrect schema');
                return null;
            }

            // Extract valid and invalid instances
            const validInstances: string[] = [];
            const invalidInstances: string[] = [];

            const validElements = element.getChildren().filter(child => 
                child instanceof XMLElement && child.getName() === 'valid'
            ) as XMLElement[];

            const invalidElements = element.getChildren().filter(child => 
                child instanceof XMLElement && child.getName() === 'invalid'
            ) as XMLElement[];

            for (const validElement of validElements) {
                const content = this.extractInstanceContent(validElement);
                if (content) validInstances.push(content);
            }

            for (const invalidElement of invalidElements) {
                const content = this.extractInstanceContent(invalidElement);
                if (content) invalidInstances.push(content);
            }

            return {
                section,
                description,
                isCorrect,
                schema,
                validInstances,
                invalidInstances
            };
        } catch (error) {
            console.error('Error parsing test case:', error);
            return null;
        }
    }

    private extractSchemaContent(element: XMLElement): string {
        // Get the first child element which should be the RelaxNG schema
        const children = element.getChildren();
        for (const child of children) {
            if (child instanceof XMLElement) {
                return this.elementToXmlString(child);
            }
        }
        return '';
    }

    private extractInstanceContent(element: XMLElement): string {
        // Get the first child element which should be the XML instance
        const children = element.getChildren();
        for (const child of children) {
            if (child instanceof XMLElement) {
                return this.elementToXmlString(child);
            }
        }
        return '';
    }

    private elementToXmlString(element: XMLElement): string {
        // Simple XML serialization - you might want to use XMLWriter for more complete implementation
        let result = `<${element.getName()}`;
        
        // Add attributes
        const attributes = element.getAttributes();
        for (const attr of attributes) {
            result += ` ${attr.getName()}="${attr.getValue()}"`;
        }
        
        const children = element.getChildren();
        const textContent = element.getText();
        
        if (children.length === 0 && !textContent) {
            result += '/>';
        } else {
            result += '>';
            
            // Add text content if any
            if (textContent) {
                result += textContent;
            }
            
            // Add child elements
            for (const child of children) {
                result += this.elementToXmlString(child);
            }
            
            result += `</${element.getName()}>`;
        }
        
        return result;
    }

    private async runTestCase(testCase: TestCase): Promise<TestResult> {
        const result: TestResult = {
            testCase,
            schemaValidationResult: false,
            instanceValidationResults: [],
            passed: false
        };

        try {
            // Test schema validity
            if (testCase.schema) {
                result.schemaValidationResult = await this.validateSchema(testCase.schema, testCase.isCorrect);
                
                // For incorrect schemas, we expect validation to fail
                const schemaTestPassed = testCase.isCorrect ? result.schemaValidationResult : !result.schemaValidationResult;
                
                if (!schemaTestPassed) {
                    result.error = `Schema validation ${testCase.isCorrect ? 'failed' : 'unexpectedly succeeded'}`;
                    return result;
                }

                // If schema is correct, test instances
                if (testCase.isCorrect && result.schemaValidationResult) {
                    // Test valid instances
                    for (const instance of testCase.validInstances) {
                        const validationResult = await this.validateInstance(testCase.schema, instance);
                        result.instanceValidationResults.push({
                            instance,
                            expected: true,
                            actual: validationResult,
                            passed: validationResult
                        });
                    }

                    // Test invalid instances
                    for (const instance of testCase.invalidInstances) {
                        const validationResult = await this.validateInstance(testCase.schema, instance);
                        result.instanceValidationResults.push({
                            instance,
                            expected: false,
                            actual: validationResult,
                            passed: !validationResult
                        });
                    }
                }
            }

            // Check if all instance validations passed
            const allInstancesPassed = result.instanceValidationResults.every(r => r.passed);
            
            // For schema-only tests (no instances), consider passed if schema validation met expectations
            // For tests with instances, require both schema and instance validations to pass
            if (result.instanceValidationResults.length === 0) {
                // Schema-only test: passed if schema validation result matched expectation
                result.passed = !result.error;
            } else {
                // Test with instances: passed if no errors and all instances validated correctly
                result.passed = !result.error && allInstancesPassed;
            }

        } catch (error) {
            result.error = (error as Error).message;
        }

        return result;
    }

    private async validateSchema(schemaContent: string, expectValid: boolean = true): Promise<boolean> {
        try {
            // Write schema to temporary file
            const tempSchemaFile = resolve(this.outputDir, 'temp-schema.rng');
            this.ensureOutputDir();
            writeFileSync(tempSchemaFile, schemaContent);

            // Try to parse the schema
            const relaxNGParser = new RelaxNGParser();
            relaxNGParser.parseGrammar(tempSchemaFile);
            return true;
        } catch (error) {
            const errorMessage = (error as Error).message;
            
            // Don't treat "Not a RelaxNG schema" as a parsing failure
            // This is expected in composite environments
            if (errorMessage.includes('Not a RelaxNG schema')) {
                if (this.verbose && expectValid) {
                    console.log(`Schema validation failed: ${errorMessage}`);
                }
                return false;
            }
            
            if (this.verbose && expectValid) {
                console.log(`Schema validation failed: ${errorMessage}`);
            }
            return false;
        }
    }

    private async validateInstance(schemaContent: string, instanceContent: string): Promise<boolean> {
        try {
            // Write files to temporary location
            const tempSchemaFile = resolve(this.outputDir, 'temp-schema.rng');
            const tempInstanceFile = resolve(this.outputDir, 'temp-instance.xml');
            
            this.ensureOutputDir();
            writeFileSync(tempSchemaFile, schemaContent);
            writeFileSync(tempInstanceFile, instanceContent);

            // Parse and validate
            const relaxNGParser = new RelaxNGParser();
            const grammar = relaxNGParser.parseGrammar(tempSchemaFile);
            
            const composite = RelaxNGComposite.getInstance();
            composite.addGrammar(grammar);

            const parser = new SAXParser();
            const builder = new DOMBuilder();
            parser.setContentHandler(builder);
            
            // Use proper GrammarHandler instead of mock object
            const grammarHandler = new GrammarHandler();
            grammarHandler.setValidating(true);
            parser.setGrammarHandler(grammarHandler);

            parser.parseFile(tempInstanceFile);
            return true;
        } catch (error) {
            if (this.verbose) {
                console.log(`Instance validation failed: ${(error as Error).message}`);
            }
            return false;
        }
    }

    private ensureOutputDir(): void {
        if (!existsSync(this.outputDir)) {
            mkdirSync(this.outputDir, { recursive: true });
        }
    }

    private generateReport(results: TestResult[]): void {
        const passedTests = results.filter(r => r.passed).length;
        const totalTests = results.length;
        
        console.log(`\n=== RelaxNG Test Suite Results ===`);
        console.log(`Total tests: ${totalTests}`);
        console.log(`Passed: ${passedTests}`);
        console.log(`Failed: ${totalTests - passedTests}`);
        console.log(`Success rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

        // Show failure breakdown by category
        const failuresByCategory = new Map<string, number>();
        const failedResults = results.filter(r => !r.passed);
        
        for (const result of failedResults) {
            const category = this.categorizeFailure(result.error || 'Unknown error');
            failuresByCategory.set(category, (failuresByCategory.get(category) || 0) + 1);
        }

        if (failuresByCategory.size > 0) {
            console.log(`\nFailure breakdown:`);
            for (const [category, count] of failuresByCategory) {
                console.log(`  ${category}: ${count}`);
            }
        }

        // Write detailed report
        const reportFile = resolve(this.outputDir, 'relaxng-test-report.json');
        this.ensureOutputDir();
        writeFileSync(reportFile, JSON.stringify(results, null, 2));
        console.log(`\nDetailed report written to: ${reportFile}`);
    }

    private categorizeFailure(error: string): string {
        if (error.includes('unexpectedly succeeded')) {
            return 'Schema validation should have failed';
        }
        if (error.includes('Schema validation failed')) {
            return 'Schema validation failed unexpectedly';
        }
        if (error.includes('Instance validation failed')) {
            return 'Instance validation issues';
        }
        if (error.includes('setCurrentFile is not a function')) {
            return 'Interface method missing';
        }
        return 'Other errors';
    }
}

// Main execution function when run directly
async function runRelaxNGTests() {
    const testSuiteFile = resolve(__dirname, '../../tests/relaxng/spectest.xml');
    const outputDir = resolve(__dirname, '../../test-output/relaxng');
    
    const runner = new RelaxNGTestRunner(testSuiteFile, outputDir);
    runner.setVerbose(true);
    
    console.log('Starting RelaxNG test suite...');
    console.log(`Test suite file: ${testSuiteFile}`);
    console.log(`Output directory: ${outputDir}`);
    
    try {
        const results = await runner.runTestSuite();
        
        const passedTests = results.filter(r => r.passed).length;
        const totalTests = results.length;
        
        console.log(`\nFinal Results:`);
        console.log(`   Tests run: ${totalTests}`);
        console.log(`   Passed: ${passedTests}`);
        console.log(`   Failed: ${totalTests - passedTests}`);
        console.log(`   Success rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
        
        if (passedTests === totalTests) {
            console.log('\nAll tests passed!');
            process.exit(0);
        } else {
            console.log(`\n${totalTests - passedTests} tests failed. See detailed report for more information.`);
            process.exit(1);
        }
    } catch (error) {
        console.error('Error running test suite:', error);
        process.exit(1);
    }
}

// Run if this file is executed directly
if (require.main === module) {
    runRelaxNGTests();
}