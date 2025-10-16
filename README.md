# TypesXML

Open source XML library written in TypeScript with extensible multi-schema validation framework

## Documentation

- **[Complete API Documentation](./API_DOCUMENTATION.md)** - Comprehensive guide with examples and API reference
- **[Quick Reference Guide](./QUICK_REFERENCE.md)** - Cheat sheet for common operations and usage patterns
- **[AI Agent Guidelines](./AI_AGENT_GUIDELINES.md)** - Performance, memory, and best practice guidelines for AI assistants
- **[Troubleshooting Guide](./TROUBLESHOOTING.md)** - Common issues, solutions, and debugging techniques
- **[Type Definitions](./API_TYPES.d.ts)** - TypeScript type definitions for better IDE support

## Licensing

TypesXML is available under a **dual licensing model**:

### 🆓 Open Source License (AGPL-3.0)

**Free for:**

- ✅ **Open source projects** (AGPL-compatible)
- ✅ **Personal and educational use**
- ✅ **Internal business tools** (with source sharing)
- ✅ **Research and development**

**Requirements under AGPL:**

- 📝 **Share source code** of your application
- 📝 **Use AGPL-compatible license** for your project
- 📝 **Provide source to users** (including SaaS users)

### 💼 Commercial License

**Required for:**

- ❌ **Proprietary software** distribution
- ❌ **SaaS applications** without source sharing
- ❌ **Commercial products** embedding TypesXML
- ❌ **Closed-source applications**

**Commercial license includes:**

- ✅ **No source sharing requirements**
- ✅ **Professional support and SLA**
- ✅ **Legal protection and indemnification**
- ✅ **Priority access to new features**

**📞 Commercial Licensing:** [sales@maxprograms.com](mailto:sales@maxprograms.com)

**📄 License Details:** [AGPL-3.0](./LICENSE) | [Commercial License](./LICENSE-COMMERCIAL.md)

## Overview

TypesXML implements a complete XML 1.0/1.1 parser with an extensible Grammar framework that supports multiple schema validation approaches. The core architecture provides both SAX (event-driven) and DOM (tree-based) parsing with unified validation through the Grammar interface.

### Grammar Framework

The Grammar interface provides a unified abstraction for schema validation that supports:

- **DTD Validation**: Complete Document Type Definition support with full validation
- **XML Schema**: Extensible framework ready for XML Schema implementation
- **RelaxNG**: Extensible framework ready for RelaxNG implementation
- **No-Operation Mode**: Graceful processing without schema validation

### ContentHandler Interface

The SAX parser exposes methods through the `ContentHandler` interface:

- `initialize(): void`
- `setCatalog(catalog: Catalog): void`
- `setGrammar(grammar: Grammar): void`
- `setIncludeDefaultAttributes(include: boolean): void`
- `startDocument(): void`
- `endDocument(): void`
- `xmlDeclaration(version: string, encoding: string, standalone: string): void`
- `startElement(name: string, atts: Array<XMLAttribute>): void`
- `endElement(name: string): void`
- `internalSubset(declaration: string): void`
- `characters(ch: string): void`
- `ignorableWhitespace(ch: string): void`
- `comment(ch: string): void`
- `processingInstruction(target: string, data: string): void`
- `startCDATA(): void`
- `endCDATA(): void`
- `startDTD(name: string, publicId: string, systemId: string): void`
- `endDTD(): void`
- `skippedEntity(name: string): void`

The `DOMBuilder` class implements the `ContentHandler` interface and builds a DOM tree from XML documents.

## Features

### Core XML Processing

- **Complete XML 1.0/1.1 Parser**: Full specification compliance with comprehensive error handling
- **SAX Parser**: Event-driven parsing for memory-efficient processing of large documents
- **DOM Builder**: Creates complete in-memory tree representation of XML documents
- **Encoding Support**: Handles various character encodings including UTF-8, UTF-16LE
- **Entity Resolution**: Built-in support for XML entities and catalog-based resolution
- **Namespace Support**: Full XML namespace handling with QualifiedName system

### Grammar-Based Validation Framework

- **Extensible Grammar Interface**: Unified abstraction supporting multiple schema types
- **DTD Grammar**: Complete Document Type Definition implementation
- **Namespace-Aware Processing**: QualifiedName system for namespace-aware validation
- **Validation Context**: Rich error reporting with line/column information
- **Flexible Validation Modes**: Configurable strictness levels for different use cases

### Complete DTD Support

- **DTD Grammar Implementation**: Full parsing and validation of Document Type Definitions including:
  - Element declarations with content models (EMPTY, ANY, Mixed, Children)
  - Attribute list declarations with all attribute types
  - Entity declarations (parameter and general entities)
  - Notation declarations
  - Internal and external subset processing
- **Content Model Processing**:
  - Complex content model parsing (sequences, choices, cardinality)
  - Mixed content detection and validation
  - Element children resolution and integrity checking
  - Complete validation of element sequences, choice groups, and cardinality constraints
- **Default Attribute Processing**: Automatic setting of default attribute values from DTD declarations:
  - Direct default values: `attr CDATA "default-value"`
  - Fixed declarations: `attr CDATA #FIXED "fixed-value"`
  - Enumeration defaults: `format (html|dita) "dita"`
  - DITA Processing Ready: Automatically sets essential `@class` attributes for DITA workflows
- **Flexible Processing**: DTD parsing and default attribute setting works in both validating and non-validating modes
- **Catalog Support**: Full XML Catalog resolution for DTD and entity references
- **Enterprise-Grade Error Handling**: Comprehensive validation with detailed error reporting for:
  - Missing required elements and attributes
  - Invalid element sequences and content models
  - Cardinality violations (wrong number of occurrences)
  - Undeclared elements and attributes
  - Invalid attribute values and types

### Additional Features

- **XML Writer**: Utilities for writing XML documents to files with proper formatting
- **Indentation Support**: Automatic indentation and prettification of XML documents
- **W3C Compliance**: Extensive testing against official W3C XML Test Suite

## Installation

```bash
npm install typesxml
```

## Testing

TypesXML includes a comprehensive test suite that validates against the **W3C XML Test Suite** - the official standard for XML parser compliance.

### Quick Start Testing

```bash
# Setup test suite (first time only)
npm run test:setup

# Run comprehensive W3C XML Test Suite
npm test

# Run XML canonicalizer tests
npm run test:canonicalizer
```

### Comprehensive Test Features

🎯 **Complete W3C Coverage**

- Tests against 500+ official W3C XML test files
- Validates parsing, canonicalization, and error detection
- Covers valid, invalid, and not-well-formed documents

📊 **Advanced Reporting**

- Real-time progress indicators with ETA
- Detailed statistics by test category
- Performance benchmarks and timing analysis
- Error categorization and analysis
- Saves comprehensive JSON reports

🚀 **Smart Execution**

- Automatic test environment validation
- Efficient batch processing for large test sets
- Graceful handling of missing test files

### Test Categories

- **Valid Documents**: Should parse successfully and match canonical output
- **Invalid Documents**: Well-formed but fail DTD validation
- **Not-Well-Formed**: Should be rejected during parsing

### Sample Output

```text
╔══════════════════════════════════════════════════════════════╗
║              TypesXML W3C Comprehensive Test Suite          ║
╚══════════════════════════════════════════════════════════════╝

📊 OVERALL STATISTICS
   Total Test Files: 531
   Tests Passed: 492
   Tests Failed: 39
   Success Rate: 92.65%
   Execution Time: 8.45 seconds

🏆 XML COMPLIANCE SUMMARY
   📋 Valid Document Processing: 96.2%
   🚫 Invalid Document Rejection: 89.1%
   🌟 EXCELLENT: High compliance with XML standards
```

For detailed testing documentation, see [`tests/README.md`](./tests/README.md).

## Example

### Basic Usage

```TypeScript
import { ContentHandler } from "./ContentHandler";
import { DOMBuilder } from "./DOMBuilder";
import { SAXParser } from "./SAXParser";
import { XMLDocument } from "./XMLDocument";
import { XMLElement } from "./XMLElement";

export class Test {

    constructor() {
        try {
            let contentHandler: ContentHandler = new DOMBuilder();
            let xmlParser = new SAXParser();
            xmlParser.setContentHandler(contentHandler);

            // build the document from a file
            xmlParser.parseFile("test.xml");
            let doc: XMLDocument = (contentHandler as DOMBuilder).getDocument();
            let root: XMLElement = doc.getRoot();
            console.log(doc.toString());

            //  build the document again, this time from a string
            xmlParser.parseString(doc.toString());
            let newDoc : XMLDocument = (contentHandler as DOMBuilder).getDocument();
            console.log(newDoc.toString());

        } catch (error: any) {
            if (error instanceof Error) {
                console.log(error.message);
            } else {
                console.log(error);
            }
        }
    }
}

new Test();
```

### Grammar-Based DTD Validation

```TypeScript
import { DOMBuilder } from "./DOMBuilder";
import { SAXParser } from "./SAXParser";
import { DTDParser } from "./dtd/DTDParser";
import { DTDGrammar } from "./dtd/DTDGrammar";
import { Catalog } from "./Catalog";
import { XMLWriter } from "./XMLWriter";
import { Indenter } from "./Indenter";

// Example with Grammar framework and DTD validation
const ditaXml = `<?xml version="1.0"?>
<!DOCTYPE concept PUBLIC "-//OASIS//DTD DITA Concept//EN" "concept.dtd">
<concept id="example">
    <title>Example Topic</title>
    <conbody>
        <p>This paragraph will get default @class attributes automatically.</p>
    </conbody>
</concept>`;

try {
    const parser = new SAXParser();
    const builder = new DOMBuilder();
    
    // Set up DTD grammar for validation
    const dtdParser = new DTDParser();
    
    // Optional: Set up catalog for DTD resolution
    const catalog = new Catalog('/path/to/catalog.xml');
    builder.setCatalog(catalog);
    dtdParser.setCatalog(catalog);
    
    // Parse DTD and create grammar
    const dtdGrammar: DTDGrammar = dtdParser.parseDTD('concept.dtd');
    
    // Configure parser with grammar
    parser.setGrammar(dtdGrammar);
    parser.setValidating(true); // Enable strict validation
    parser.setIncludeDefaultAttributes(true); // Include default attributes
    parser.setContentHandler(builder);
    
    // Parse the document with validation
    parser.parseString(ditaXml);
    const doc = builder.getDocument();
    
    // Check if default attributes were added (depends on DTD availability)
    const root = doc?.getRoot();
    const classAttr = root?.getAttribute('class');
    if (classAttr) {
        console.log(`Root @class: ${classAttr.getValue()}`);
        // Output when DTD is available: "- topic/topic concept/concept "
    } else {
        console.log('No @class attribute found (DTD not available)');
    }
    
    // Prettify the document with proper indentation
    const indenter = new Indenter(2); // 2 spaces per level
    if (root) {
        indenter.indent(root);
    }
    
    // Write the processed and prettified document
    XMLWriter.writeDocument(doc!, 'output.xml');
    
} catch (error: any) {
    if (error.message.includes('validation')) {
        console.log('DTD Validation Error:', error.message);
        // Handle validation errors appropriately
    } else {
        console.log('Parsing Error:', error.message);
    }
}
```

### Flexible Validation Modes

```TypeScript
import { SAXParser, DOMBuilder, DTDParser, NoOpGrammar } from 'typesxml';

// Example: Strict validation that rejects invalid documents
const invalidXml = `<?xml version="1.0"?>
<!DOCTYPE book [
  <!ELEMENT book (title, author+, chapter*)>
  <!ELEMENT title (#PCDATA)>
  <!ELEMENT author (#PCDATA)>
]>
<book>
  <title>Book Title</title>
  <!-- Missing required author+ elements - will cause validation error -->
</book>`;

const parser = new SAXParser();
const builder = new DOMBuilder();

// Parse internal DTD and create grammar
const dtdParser = new DTDParser();
const internalDTD = `
<!ELEMENT book (title, author+, chapter*)>
<!ELEMENT title (#PCDATA)>
<!ELEMENT author (#PCDATA)>
<!ELEMENT chapter (title, content)>
<!ELEMENT content (#PCDATA)>
`;
const dtdGrammar = dtdParser.parseInternalSubset(internalDTD);

// Configure parser with strict validation
parser.setGrammar(dtdGrammar);
parser.setValidating(true); // Enable strict validation
parser.setContentHandler(builder);

try {
    parser.parseString(invalidXml);
    console.log('Document is valid');
} catch (error) {
    console.log('Validation failed:', error.message);
    // Output: "Content model validation failed for element 'book': Required content particle '(title,author+,chapter*)' not satisfied"
}

// Alternative: Use NoOpGrammar for processing without validation
const noOpGrammar = new NoOpGrammar();
parser.setGrammar(noOpGrammar);
parser.setValidating(false);

// This will parse successfully without validation
parser.parseString(invalidXml);
console.log('Document parsed without validation');
```
