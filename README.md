# TypesXML

XML library written in TypeScript with multi-schema validation framework

## Documentation

- **[Complete API Documentation](./API_DOCUMENTATION.md)** - Comprehensive guide with examples and API reference
- **[Quick Reference Guide](./QUICK_REFERENCE.md)** - Cheat sheet for common operations and usage patterns
- **[Developer & AI Reference](./AI_AGENT_GUIDELINES.md)** - Comprehensive technical reference with performance guidance and best practices
- **[Conformance Tests](./CONFORMANCE_TESTS.md)** - W3C test suite integration for DTD and XML Schema validation testing
- **[Troubleshooting Guide](./TROUBLESHOOTING.md)** - Common issues, solutions, and debugging techniques
- **[Type Definitions](./API_TYPES.d.ts)** - TypeScript type definitions for better IDE support

## Licensing

TypesXML is available under two licenses: [AGPL-3.0](./LICENSE) for open source projects and a [Commercial License](./LICENSE-COMMERCIAL.md) for proprietary use. For commercial licensing inquiries, contact [sales@maxprograms.com](mailto:sales@maxprograms.com).

## Overview

TypesXML implements XML 1.0/1.1 parsing with an extensible Grammar framework supporting multiple schema validation approaches. The library provides both SAX (event-driven) and DOM (tree-based) parsing with validation through a unified Grammar interface.

### Grammar Framework

The Grammar interface provides schema validation support for:

- **DTD Validation**: Complete Document Type Definition support with full validation
- **XML Schema**: Comprehensive implementation with 76% W3C test suite success rate, including complex types, sequences, choices, and namespace-aware validation

### Recent Major Enhancements (October 2025)

- **Enhanced XML Schema Support**: Significant improvements to complex type validation, inheritance, and extension support
- **Performance Improvements**: Eliminated validation bottlenecks and optimized algorithms for better performance
- **Enhanced Error Reporting**: Detailed validation context with line/column information and improved error messages
- **W3C Compliance**: 76% success rate on official W3C XML Schema test suite (49,072/64,543 files)

### Key Features

- **OASIS Catalog Support**: Full XML Catalog resolution for DTD and entity references
- **Entity Resolution**: Built-in support for XML entities and catalog-based resolution
- **Namespace Support**: XML namespace handling with QualifiedName system
- **Encoding Support**: Various character encodings including UTF-8, UTF-16LE
- **XML Writer**: Utilities for writing XML documents with proper formatting

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

- **XML 1.0/1.1 Parser**: Full specification compliance with comprehensive error handling
- **SAX Parser**: Event-driven parsing for memory-efficient processing of large documents
- **DOM Builder**: Creates complete in-memory tree representation of XML documents
- **OASIS Catalog Support**: Full XML Catalog resolution for DTD and entity references
- **Entity Resolution**: Built-in support for XML entities and catalog-based resolution
- **Namespace Support**: Full XML namespace handling with QualifiedName system

### Grammar-Based Validation Framework

- **Extensible Grammar Interface**: Unified abstraction supporting multiple schema types
- **DTD Grammar**: Complete Document Type Definition implementation
- **XML Schema Support**: Comprehensive implementation with complex type validation, inheritance, and namespace-aware processing
- **Namespace-Aware Processing**: QualifiedName system for namespace-aware validation
- **Validation Context**: Rich error reporting with line/column information
- **Flexible Validation Modes**: Configurable strictness levels for different use cases
- **Optimized Performance**: Enhanced validation algorithms with proper element consumption tracking

### Complete DTD Support

- **DTD Grammar Implementation**: Full parsing and validation of Document Type Definitions including element declarations, attribute lists, entities, and notations
- **Content Model Processing**: Complex content model parsing with sequences, choices, and cardinality validation
- **Default Attribute Processing**: Automatic setting of default attribute values from DTD declarations
- **Internal and External Subset Processing**: Complete DTD merging with proper precedence handling
- **Enterprise-Grade Error Handling**: Comprehensive validation with detailed error reporting

### Additional Features

- **XML Writer**: Utilities for writing XML documents to files with proper formatting
- **Indentation Support**: Automatic indentation and prettification of XML documents
- **W3C Compliance**: Extensive testing against official W3C XML Test Suite with documented conformance results
- **Conformance Testing**: Integrated test runners for W3C DTD and XML Schema test suites

## Installation

```bash
npm install typesxml
```

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
