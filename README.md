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

- **DTD Validation**: Document Type Definition support with validation
- **XML Schema**: Implementation with 76% W3C test suite success rate, including complex types, sequences, choices, and namespace-aware validation

### Key Features

- **OASIS Catalog Support**: XML Catalog resolution for DTD and XML Schema references
- **Entity Resolution**: Support for XML entities and catalog-based resolution
- **Namespace Support**: XML namespace handling with QualifiedName system
- **Encoding Support**: Character encodings including UTF-8, UTF-16LE
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

- **XML 1.0/1.1 Parser**: Specification compliance with error handling
- **SAX Parser**: Event-driven parsing for memory-efficient processing of large documents
- **DOM Builder**: Creates in-memory tree representation of XML documents
- **OASIS Catalog Support**: XML Catalog resolution for DTD and XML Schema references
- **Entity Resolution**: Support for XML entities and catalog-based resolution
- **Namespace Support**: XML namespace handling with QualifiedName system

### Grammar-Based Validation Framework

- **Extensible Grammar Interface**: Abstraction supporting multiple schema types
- **DTD Grammar**: Document Type Definition implementation
- **XML Schema Support**: Implementation with complex type validation, inheritance, and namespace-aware processing
- **Namespace-Aware Processing**: QualifiedName system for namespace-aware validation
- **Validation Context**: Error reporting
- **Validation Modes**: Configurable strictness levels for different use cases
- **Performance**: Validation algorithms with element consumption tracking

### DTD Support

- **DTD Grammar Implementation**: Parsing and validation of Document Type Definitions including element declarations, attribute lists, entities, and notations
- **Default Attribute Processing**: Setting of default attribute values from DTD declarations
- **Internal and External Subset Processing**: DTD merging with precedence handling
- **Error Handling**: Validation with error reporting

### Additional Features

- **XML Writer**: Utilities for writing XML documents to files with formatting
- **Indentation Support**: Indentation and prettification of XML documents
- **W3C Compliance**: Testing against W3C XML Test Suite with documented conformance results
- **Conformance Testing**: Test runners for W3C DTD and XML Schema test suites

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
