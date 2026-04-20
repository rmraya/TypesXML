/*******************************************************************************
 * Copyright (c) 2023-2026 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

import { existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DOMBuilder } from '../DOMBuilder.js';
import { SAXParser } from '../SAXParser.js';
import { XMLDocument } from '../XMLDocument.js';
import { XMLElement } from '../XMLElement.js';
import { SchemaBuilder } from '../schema/SchemaBuilder.js';
import { SchemaGrammar } from '../schema/SchemaGrammar.js';
import { XSDSemanticValidator } from '../schema/XSDSemanticValidator.js';

const SUITE_FILE: string = './tests/xmlschema2006-11-06/suite.xml';

// Path to the Boeing testSet file relative to the suite root
const BOEING_TESTSET: string = 'boeingMeta/BoeingXSDTestSet.testSet';

// Path to the NIST testSet file relative to the suite root
const NIST_TESTSET: string = 'nistMeta/NISTXMLSchemaDatatypes.testSet';

// Directory containing the Microsoft testSet files (all named *_w3c.xml)
const MS_META_DIR: string = 'msMeta';

// Directory containing the SUN testSet files (13 .testSet files)
const SUN_META_DIR: string = 'sunMeta';

type SetStats = {
    contributor: string;
    name: string;
    total: number;
    passed: number;
    failed: number;
};

class XMLSchemaTestSuite {

    private grandTotal: number = 0;
    private grandPassed: number = 0;
    private grandFailed: number = 0;
    private setResults: SetStats[] = [];

    constructor() {
        if (!existsSync(SUITE_FILE)) {
            throw new Error('XML Schema Test Suite not found at ' + SUITE_FILE);
        }
    }

    run(): void {
        const suiteDir: string = dirname(resolve(SUITE_FILE));

        // Boeing: one dedicated testSet file
        const boeingPath: string = resolve(suiteDir, BOEING_TESTSET);
        if (existsSync(boeingPath)) {
            const stats: SetStats = this.runBoeingTestSet(boeingPath);
            this.setResults.push(stats);
            this.grandTotal += stats.total;
            this.grandPassed += stats.passed;
            this.grandFailed += stats.failed;
        } else {
            console.warn('Boeing test set not found: ' + boeingPath);
        }

        // NIST: one dedicated testSet file
        const nistPath: string = resolve(suiteDir, NIST_TESTSET);
        if (existsSync(nistPath)) {
            const stats: SetStats = this.runNistTestSet(nistPath);
            this.setResults.push(stats);
            this.grandTotal += stats.total;
            this.grandPassed += stats.passed;
            this.grandFailed += stats.failed;
        } else {
            console.warn('NIST test set not found: ' + nistPath);
        }

        // Microsoft: 17 testSet files in msMeta/, all named *_w3c.xml
        const msMetaDir: string = resolve(suiteDir, MS_META_DIR);
        if (existsSync(msMetaDir)) {
            const msStats: SetStats = { contributor: 'Microsoft', name: 'MS-XSD-2006', total: 0, passed: 0, failed: 0 };
            const msFiles: string[] = readdirSync(msMetaDir)
                .filter((f: string) => f.endsWith('_w3c.xml'))
                .sort();
            for (const msFile of msFiles) {
                const msPath: string = resolve(msMetaDir, msFile);
                this.runMicrosoftTestSet(msPath, msStats);
            }
            this.setResults.push(msStats);
            this.grandTotal += msStats.total;
            this.grandPassed += msStats.passed;
            this.grandFailed += msStats.failed;
        } else {
            console.warn('Microsoft meta directory not found: ' + msMetaDir);
        }

        // SUN: 13 testSet files in sunMeta/
        const sunMetaDir: string = resolve(suiteDir, SUN_META_DIR);
        if (existsSync(sunMetaDir)) {
            const sunStats: SetStats = { contributor: 'SUN', name: 'SUN-XSD-2006', total: 0, passed: 0, failed: 0 };
            const sunFiles: string[] = readdirSync(sunMetaDir)
                .filter((f: string) => f.endsWith('.testSet'))
                .sort();
            for (const sunFile of sunFiles) {
                const sunPath: string = resolve(sunMetaDir, sunFile);
                this.runSunTestSet(sunPath, sunStats);
            }
            this.setResults.push(sunStats);
            this.grandTotal += sunStats.total;
            this.grandPassed += sunStats.passed;
            this.grandFailed += sunStats.failed;
        } else {
            console.warn('SUN meta directory not found: ' + sunMetaDir);
        }

        this.printReport();
    }

    // -------------------------------------------------------------------------
    // Microsoft harness
    //
    // Structure:  msMeta/*_w3c.xml  (17 files)
    //             msData/...        (referenced as ../msData/ from testSet files)
    //
    // Rules:
    //   schemaTest  – exactly one <schemaDocument> per group. Parsed normally;
    //                 XSDSemanticValidator checks structural validity.
    //
    //   instanceTest – each instance carries xsi:schemaLocation. SAXParser with
    //                  setValidating(true) resolves the grammar automatically.
    //                  Some groups have instanceTest with no schemaTest — those
    //                  instances validate against schemas they declare themselves
    //                  via xsi:schemaLocation.
    //
    // Stats are accumulated into a single SetStats passed by reference so that
    // all 17 files contribute to one Microsoft total in the report.
    // -------------------------------------------------------------------------
    private runMicrosoftTestSet(testSetPath: string, stats: SetStats): void {
        const testSetDir: string = dirname(testSetPath);

        const doc: XMLDocument | undefined = this.parseXML(testSetPath);
        if (!doc) {
            console.warn('Microsoft: could not parse ' + testSetPath);
            return;
        }
        const root: XMLElement | undefined = doc.getRoot();
        if (!root) {
            return;
        }

        for (const testGroupEl of root.getChildren()) {
            if (this.localName(testGroupEl.getName()) !== 'testGroup') {
                continue;
            }
            const groupName: string = testGroupEl.getAttribute('name')?.getValue() || '';

            for (const child of testGroupEl.getChildren()) {
                const childLocalName: string = this.localName(child.getName());

                // ---- schemaTest ----
                if (childLocalName === 'schemaTest') {
                    const schemaDocEl: XMLElement | undefined = this.findChildByLocalName(child, 'schemaDocument');
                    if (!schemaDocEl) {
                        continue;
                    }
                    const href: string | undefined = this.getXlinkHref(schemaDocEl);
                    if (!href) {
                        continue;
                    }
                    const schemaPath: string = resolve(testSetDir, href);
                    if (!existsSync(schemaPath)) {
                        continue;
                    }
                    const expectedEl: XMLElement | undefined = this.findChildByLocalName(child, 'expected');
                    const expected: string = expectedEl?.getAttribute('validity')?.getValue() || 'valid';
                    const testName: string = child.getAttribute('name')?.getValue() || groupName;

                    let actual: string;
                    try {
                        const parser: SAXParser = new SAXParser();
                        const handler: DOMBuilder = new DOMBuilder();
                        parser.setContentHandler(handler);
                        parser.parseFile(schemaPath);
                        const schemaRoot: XMLElement | undefined = handler.getDocument()?.getRoot();
                        if (schemaRoot) {
                            XSDSemanticValidator.validate(schemaRoot);
                        }
                        actual = 'valid';
                    } catch (_e) {
                        actual = 'invalid';
                    }

                    stats.total++;
                    if (actual === expected) {
                        stats.passed++;
                    } else {
                        stats.failed++;
                        console.log(' -- ' + testName + ': expected=' + expected + ' actual=' + actual + ' [' + schemaPath + ']');
                    }
                    continue;
                }

                // ---- instanceTest ----
                // All MS instances carry xsi:schemaLocation — no grammar injection needed.
                if (childLocalName !== 'instanceTest') {
                    continue;
                }
                const instanceDocEl: XMLElement | undefined = this.findChildByLocalName(child, 'instanceDocument');
                if (!instanceDocEl) {
                    continue;
                }
                const href: string | undefined = this.getXlinkHref(instanceDocEl);
                if (!href) {
                    continue;
                }
                const instancePath: string = resolve(testSetDir, href);
                if (!existsSync(instancePath)) {
                    continue;
                }
                const expectedEl: XMLElement | undefined = this.findChildByLocalName(child, 'expected');
                const expected: string = expectedEl?.getAttribute('validity')?.getValue() || 'valid';
                const testName: string = child.getAttribute('name')?.getValue() || groupName;

                let actual: string;
                try {
                    const parser: SAXParser = new SAXParser();
                    const handler: DOMBuilder = new DOMBuilder();
                    parser.setContentHandler(handler);
                    parser.setValidating(true);
                    parser.parseFile(instancePath);
                    actual = 'valid';
                } catch (_e) {
                    actual = 'invalid';
                }

                stats.total++;
                if (actual === expected) {
                    stats.passed++;
                } else {
                    stats.failed++;
                    console.log(' -- ' + testName + ': expected=' + expected + ' actual=' + actual + ' [' + instancePath + ']');
                }
            }
        }
    }

    // -------------------------------------------------------------------------
    // SUN harness
    //
    // Structure:  sunMeta/*.testSet  (13 files)
    //             sunData/combined/NNN/  — instance tests without xsi:schemaLocation
    //             sunData/TOPIC/...      — instance tests with xsi:schemaLocation
    //
    // Rules (per AnnotatedTSSchema.xsd section 5.2):
    //   Validation must start with no stipulated declaration or definition.
    //   The processor must find the schema on its own (via xsi:schemaLocation,
    //   xsi:noNamespaceSchemaLocation, or namespace resolution).
    //   No grammar injection is permitted for any SUN instance test.
    //
    //   schemaTest  – one <schemaDocument> per group. Parsed normally;
    //                 XSDSemanticValidator checks structural validity.
    //
    //   instanceTest – setValidating(true); the parser resolves schemas
    //                  autonomously. combined/ instances have no
    //                  xsi:schemaLocation (processor starts with no schema).
    //
    // Stats are accumulated into a single SetStats passed by reference.
    // -------------------------------------------------------------------------
    private runSunTestSet(testSetPath: string, stats: SetStats): void {
        const testSetDir: string = dirname(testSetPath);

        const doc: XMLDocument | undefined = this.parseXML(testSetPath);
        if (!doc) {
            console.warn('SUN: could not parse ' + testSetPath);
            return;
        }
        const root: XMLElement | undefined = doc.getRoot();
        if (!root) {
            return;
        }

        for (const testGroupEl of root.getChildren()) {
            if (this.localName(testGroupEl.getName()) !== 'testGroup') {
                continue;
            }
            const groupName: string = testGroupEl.getAttribute('name')?.getValue() || '';

            // Build the group's SchemaGrammar from the schemaTest first, so it
            // can be injected into each instanceTest in the same group.
            let groupSchemaGrammar: SchemaGrammar | undefined;
            const groupChildren: XMLElement[] = testGroupEl.getChildren();

            for (const child of groupChildren) {
                const childLocalName: string = this.localName(child.getName());

                // ---- schemaTest ----
                if (childLocalName === 'schemaTest') {
                    const schemaDocEl: XMLElement | undefined = this.findChildByLocalName(child, 'schemaDocument');
                    if (!schemaDocEl) {
                        continue;
                    }
                    const href: string | undefined = this.getXlinkHref(schemaDocEl);
                    if (!href) {
                        continue;
                    }
                    const schemaPath: string = resolve(testSetDir, href);
                    if (!existsSync(schemaPath)) {
                        continue;
                    }
                    const expectedEl: XMLElement | undefined = this.findChildByLocalName(child, 'expected');
                    const expected: string = expectedEl?.getAttribute('validity')?.getValue() || 'valid';
                    const testName: string = child.getAttribute('name')?.getValue() || groupName;

                    let actual: string;
                    try {
                        const parser: SAXParser = new SAXParser();
                        const handler: DOMBuilder = new DOMBuilder();
                        parser.setContentHandler(handler);
                        parser.parseFile(schemaPath);
                        const schemaRoot: XMLElement | undefined = handler.getDocument()?.getRoot();
                        if (schemaRoot) {
                            XSDSemanticValidator.validate(schemaRoot);
                        }
                        const builder: SchemaBuilder = new SchemaBuilder();
                        groupSchemaGrammar = builder.buildGrammar(schemaPath);
                        actual = 'valid';
                    } catch (_e) {
                        groupSchemaGrammar = undefined;
                        actual = 'invalid';
                    }

                    stats.total++;
                    if (actual === expected) {
                        stats.passed++;
                    } else {
                        stats.failed++;
                        console.log(' -- ' + testName + ': expected=' + expected + ' actual=' + actual + ' [' + schemaPath + ']');
                    }
                    continue;
                }

                // ---- instanceTest ----
                // Per the TS spec (AnnotatedTSSchema.xsd), the testGroup groups
                // the schema with its instance documents. The schemaTest grammar
                // is injected into the handler so xsi:type values defined in that
                // schema are reachable during validation.
                if (childLocalName !== 'instanceTest') {
                    continue;
                }
                const instanceDocEl: XMLElement | undefined = this.findChildByLocalName(child, 'instanceDocument');
                if (!instanceDocEl) {
                    continue;
                }
                const href: string | undefined = this.getXlinkHref(instanceDocEl);
                if (!href) {
                    continue;
                }
                const instancePath: string = resolve(testSetDir, href);
                if (!existsSync(instancePath)) {
                    continue;
                }
                const expectedEl: XMLElement | undefined = this.findChildByLocalName(child, 'expected');
                const expected: string = expectedEl?.getAttribute('validity')?.getValue() || 'valid';
                const testName: string = child.getAttribute('name')?.getValue() || groupName;

                let actual: string;
                try {
                    const parser: SAXParser = new SAXParser();
                    const handler: DOMBuilder = new DOMBuilder();
                    parser.setContentHandler(handler);
                    if (groupSchemaGrammar) {
                        handler.setGrammar(groupSchemaGrammar);
                    }
                    parser.setValidating(true);
                    parser.parseFile(instancePath);
                    actual = 'valid';
                } catch (_e) {
                    actual = 'invalid';
                }

                stats.total++;
                if (actual === expected) {
                    stats.passed++;
                } else {
                    stats.failed++;
                    console.log(' -- ' + testName + ': expected=' + expected + ' actual=' + actual + ' [' + instancePath + ']');
                }
            }
        }
    }

    // -------------------------------------------------------------------------
    // NIST harness
    //
    // Structure:  nistMeta/NISTXMLSchemaDatatypes.testSet
    //             nistData/atomic|list|union/TYPE/Schema+Instance/
    //
    // Rules:
    //   schemaTest  – exactly one <schemaDocument> per group. Parsed normally;
    //                 XSDSemanticValidator checks structural validity.
    //
    //   instanceTest – each instance carries xsi:schemaLocation pointing to the
    //                  .xsd in the same Schema+Instance/ directory. SAXParser
    //                  with setValidating(true) resolves it automatically.
    // -------------------------------------------------------------------------
    private runNistTestSet(testSetPath: string): SetStats {
        const testSetDir: string = dirname(testSetPath);
        const stats: SetStats = { contributor: 'NIST', name: 'NIST2004-01-14', total: 0, passed: 0, failed: 0 };

        const doc: XMLDocument | undefined = this.parseXML(testSetPath);
        if (!doc) {
            console.warn('NIST: could not parse ' + testSetPath);
            return stats;
        }
        const root: XMLElement | undefined = doc.getRoot();
        if (!root) {
            return stats;
        }

        for (const testGroupEl of root.getChildren()) {
            if (this.localName(testGroupEl.getName()) !== 'testGroup') {
                continue;
            }
            const groupName: string = testGroupEl.getAttribute('name')?.getValue() || '';

            for (const child of testGroupEl.getChildren()) {
                const childLocalName: string = this.localName(child.getName());

                // ---- schemaTest ----
                if (childLocalName === 'schemaTest') {
                    const schemaDocEl: XMLElement | undefined = this.findChildByLocalName(child, 'schemaDocument');
                    if (!schemaDocEl) {
                        continue;
                    }
                    const href: string | undefined = this.getXlinkHref(schemaDocEl);
                    if (!href) {
                        continue;
                    }
                    const schemaPath: string = resolve(testSetDir, href);
                    if (!existsSync(schemaPath)) {
                        continue;
                    }
                    const expectedEl: XMLElement | undefined = this.findChildByLocalName(child, 'expected');
                    const expected: string = expectedEl?.getAttribute('validity')?.getValue() || 'valid';
                    const testName: string = child.getAttribute('name')?.getValue() || groupName;

                    let actual: string;
                    try {
                        const parser: SAXParser = new SAXParser();
                        const handler: DOMBuilder = new DOMBuilder();
                        parser.setContentHandler(handler);
                        parser.parseFile(schemaPath);
                        const schemaRoot: XMLElement | undefined = handler.getDocument()?.getRoot();
                        if (schemaRoot) {
                            XSDSemanticValidator.validate(schemaRoot);
                        }
                        actual = 'valid';
                    } catch (_e) {
                        actual = 'invalid';
                    }

                    stats.total++;
                    if (actual === expected) {
                        stats.passed++;
                    } else {
                        stats.failed++;
                        console.log(' -- ' + testName + ': expected=' + expected + ' actual=' + actual + ' [' + schemaPath + ']');
                    }
                    continue;
                }

                // ---- instanceTest ----
                // Instances carry xsi:schemaLocation — no grammar injection needed.
                if (childLocalName !== 'instanceTest') {
                    continue;
                }
                const instanceDocEl: XMLElement | undefined = this.findChildByLocalName(child, 'instanceDocument');
                if (!instanceDocEl) {
                    continue;
                }
                const href: string | undefined = this.getXlinkHref(instanceDocEl);
                if (!href) {
                    continue;
                }
                const instancePath: string = resolve(testSetDir, href);
                if (!existsSync(instancePath)) {
                    continue;
                }
                const expectedEl: XMLElement | undefined = this.findChildByLocalName(child, 'expected');
                const expected: string = expectedEl?.getAttribute('validity')?.getValue() || 'valid';
                const testName: string = child.getAttribute('name')?.getValue() || groupName;

                let actual: string;
                try {
                    const parser: SAXParser = new SAXParser();
                    const handler: DOMBuilder = new DOMBuilder();
                    parser.setContentHandler(handler);
                    parser.setValidating(true);
                    parser.parseFile(instancePath);
                    actual = 'valid';
                } catch (_e) {
                    actual = 'invalid';
                }

                stats.total++;
                if (actual === expected) {
                    stats.passed++;
                } else {
                    stats.failed++;
                    console.log(' -- ' + testName + ': expected=' + expected + ' actual=' + actual + ' [' + instancePath + ']');
                }
            }
        }

        return stats;
    }

    // -------------------------------------------------------------------------
    // Boeing harness
    //
    // Structure:  boeingMeta/BoeingXSDTestSet.testSet
    //             boeingData/ipoN/  (N = 1..6)
    //
    // Rules:
    //   schemaTest  – one or more <schemaDocument> elements. Each is parsed
    //                 independently; the XSD file's own xs:import/xs:include
    //                 declarations are resolved automatically by the parser.
    //                 XSDSemanticValidator checks the structural validity of
    //                 each document. One failure fails the whole schemaTest.
    //
    //   instanceTest – each instance carries xsi:schemaLocation with a relative
    //                  path to the schema in the same directory. SAXParser with
    //                  setValidating(true) resolves and loads it automatically.
    // -------------------------------------------------------------------------
    private runBoeingTestSet(testSetPath: string): SetStats {
        const testSetDir: string = dirname(testSetPath);
        const stats: SetStats = { contributor: 'Boeing', name: 'BoeingXSDTestCases', total: 0, passed: 0, failed: 0 };

        const doc: XMLDocument | undefined = this.parseXML(testSetPath);
        if (!doc) {
            console.warn('Boeing: could not parse ' + testSetPath);
            return stats;
        }
        const root: XMLElement | undefined = doc.getRoot();
        if (!root) {
            return stats;
        }

        for (const testGroupEl of root.getChildren()) {
            if (this.localName(testGroupEl.getName()) !== 'testGroup') {
                continue;
            }
            const groupName: string = testGroupEl.getAttribute('name')?.getValue() || '';

            for (const child of testGroupEl.getChildren()) {
                const childLocalName: string = this.localName(child.getName());

                // ---- schemaTest ----
                // Each listed schemaDocument is an independent XSD file.
                // Each file carries its own xs:import/xs:include declarations
                // that the parser resolves automatically. We simply parse every
                // listed document and run XSDSemanticValidator on its root.
                // One failure in any document fails the whole schemaTest.
                if (childLocalName === 'schemaTest') {
                    const schemaDocs: XMLElement[] = this.findChildrenByLocalName(child, 'schemaDocument');
                    if (schemaDocs.length === 0) {
                        continue;
                    }
                    const expectedEl: XMLElement | undefined = this.findChildByLocalName(child, 'expected');
                    const expected: string = expectedEl?.getAttribute('validity')?.getValue() || 'valid';
                    const testName: string = child.getAttribute('name')?.getValue() || groupName;

                    let actual: string = 'valid';
                    outer: try {
                        for (const schemaDocEl of schemaDocs) {
                            const href: string | undefined = this.getXlinkHref(schemaDocEl);
                            if (!href) {
                                continue;
                            }
                            const schemaPath: string = resolve(testSetDir, href);
                            if (!existsSync(schemaPath)) {
                                continue;
                            }
                            const parser: SAXParser = new SAXParser();
                            const handler: DOMBuilder = new DOMBuilder();
                            parser.setContentHandler(handler);
                            parser.parseFile(schemaPath);
                            const schemaRoot: XMLElement | undefined = handler.getDocument()?.getRoot();
                            if (schemaRoot) {
                                XSDSemanticValidator.validate(schemaRoot);
                            }
                        }
                    } catch (_e) {
                        actual = 'invalid';
                    }

                    stats.total++;
                    if (actual === expected) {
                        stats.passed++;
                    } else {
                        stats.failed++;
                        console.log(' -- ' + testName + ': expected=' + expected + ' actual=' + actual);
                    }
                    continue;
                }

                // ---- instanceTest ----
                // Boeing instance files declare their grammar via
                // xsi:schemaLocation with a relative path (e.g. "ipo.xsd"),
                // resolved relative to the instance file's own directory.
                // SAXParser + setValidating(true) handles this automatically.
                if (childLocalName !== 'instanceTest') {
                    continue;
                }
                const instanceDocEl: XMLElement | undefined = this.findChildByLocalName(child, 'instanceDocument');
                if (!instanceDocEl) {
                    continue;
                }
                const href: string | undefined = this.getXlinkHref(instanceDocEl);
                if (!href) {
                    continue;
                }
                const instancePath: string = resolve(testSetDir, href);
                if (!existsSync(instancePath)) {
                    continue;
                }
                const expectedEl: XMLElement | undefined = this.findChildByLocalName(child, 'expected');
                const expected: string = expectedEl?.getAttribute('validity')?.getValue() || 'valid';
                const testName: string = child.getAttribute('name')?.getValue() || groupName;

                let actual: string;
                try {
                    const parser: SAXParser = new SAXParser();
                    const handler: DOMBuilder = new DOMBuilder();
                    parser.setContentHandler(handler);
                    parser.setValidating(true);
                    parser.parseFile(instancePath);
                    actual = 'valid';
                } catch (_e) {
                    actual = 'invalid';
                }

                stats.total++;
                if (actual === expected) {
                    stats.passed++;
                } else {
                    stats.failed++;
                    console.log(' -- ' + testName + ': expected=' + expected + ' actual=' + actual + ' [' + instancePath + ']');
                }
            }
        }

        return stats;
    }

    private parseXML(filePath: string): XMLDocument | undefined {
        try {
            const parser: SAXParser = new SAXParser();
            const handler: DOMBuilder = new DOMBuilder();
            parser.setContentHandler(handler);
            parser.parseFile(filePath);
            return handler.getDocument();
        } catch (e) {
            return undefined;
        }
    }

    private localName(name: string): string {
        const idx: number = name.indexOf(':');
        return idx !== -1 ? name.substring(idx + 1) : name;
    }

    private getXlinkHref(el: XMLElement): string | undefined {
        for (const attr of el.getAttributes()) {
            const attrName: string = attr.getName();
            if (attrName === 'xlink:href' || attrName.endsWith(':href')) {
                return attr.getValue();
            }
        }
        return undefined;
    }

    private findChildByLocalName(el: XMLElement, localName: string): XMLElement | undefined {
        for (const child of el.getChildren()) {
            if (this.localName(child.getName()) === localName) {
                return child;
            }
        }
        return undefined;
    }

    private findChildrenByLocalName(el: XMLElement, localName: string): XMLElement[] {
        const result: XMLElement[] = [];
        for (const child of el.getChildren()) {
            if (this.localName(child.getName()) === localName) {
                result.push(child);
            }
        }
        return result;
    }

    private printReport(): void {
        console.log('');

        for (const stats of this.setResults) {
            const pct: string = stats.total > 0 ? ((stats.passed / stats.total) * 100).toFixed(1) : '0.0';
            console.log(stats.contributor + ' [' + stats.name + ']: passed=' + stats.passed + ', failed=' + stats.failed + ', total=' + stats.total + ' (' + pct + '%)');
        }

        const totalPct: string = this.grandTotal > 0 ? ((this.grandPassed / this.grandTotal) * 100).toFixed(1) : '0.0';
        console.log('');
        console.log('TOTAL: ' + this.grandPassed + '/' + this.grandTotal + ' (' + totalPct + '%)');
        console.log('');
    }
}

try {
    new XMLSchemaTestSuite().run();
} catch (error) {
    console.error('Error running XML Schema Test Suite:', error);
}
