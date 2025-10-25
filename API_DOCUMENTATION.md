# TypesXML API Documentation

## Table of Contents

1. [Overview](#overview)
2. [Quick Start Guide](#quick-start-guide)
3. [Core Classes](#core-classes)
4. [Usage Patterns](#usage-patterns)
5. [Node Types](#node-types)
6. [Utility Classes](#utility-classes)
7. [Grammar Framework](#grammar-framework)
8. [Error Handling](#error-handling)
9. [Examples](#examples)

## Overview

TypesXML is an open-source XML library written in TypeScript that provides both SAX (event-driven) and DOM (tree-based) parsing capabilities. It implements a complete XML 1.0/1.1 parser with extensible grammar-based validation framework supporting multiple schema types.

### Key Features

- **Multi-Schema Validation Framework**: Extensible Grammar interface supporting DTD and XML Schema validation
- **SAX Parser**: Event-driven parsing for memory-efficient processing of large XML files
- **DOM Builder**: Creates an in-memory tree representation of XML documents
- **DTD Support**: Parsing and validation of Document Type Definitions
- **XML Schema Support**: XSD validation with 76% W3C test suite success rate
- **DTD Validation**: Validation against DTD constraints
- **XML Writer**: Utilities for writing XML documents to files
- **Encoding Support**: Handles character encodings including UTF-8, UTF-16LE
- **Entity Resolution**: Support for XML entities and catalog-based resolution
- **Namespace Support**: XML namespace handling
- **Validation**: Grammar-based validation with configurable strictness levels

## Quick Start Guide

### Installation

```bash
npm install typesxml
```

### Basic Usage

```typescript
import { SAXParser, DOMBuilder, XMLDocument, XMLElement } from 'typesxml';

// Create parser and content handler
const builder: DOMBuilder = new DOMBuilder();
const parser: SAXParser = new SAXParser();
parser.setContentHandler(builder);

// Parse XML from file (DTD validation is automatic if DTD is present)
parser.parseFile('document.xml');
const document: XMLDocument | undefined = builder.getDocument();
const rootElement: XMLElement | undefined = document?.getRoot();

// Parse XML from string
parser.parseString('<root><child>text</child></root>');
const document2: XMLDocument | undefined = builder.getDocument();

// Note: DTD or XML Schema validation is automatic if the document includes a DTD or schema reference. You do not need to manually create a DTDParser or pass a grammar for typical usage.
```

## Core Classes

### SAXParser

The main entry point for parsing XML documents. Implements an event-driven parser.

#### Constructor

```typescript
new SAXParser()
```

#### Methods

| Method | Description | Parameters | Returns |
|--------|-------------|------------|---------|
| `setContentHandler(handler)` | Sets the content handler to receive parsing events | `handler: ContentHandler` | `void` |
| `setValidating(validating)` | Enable/disable strict validation mode | `validating: boolean` | `void` |
| `setGrammar(grammar)` | Sets the grammar for validation | `grammar: Grammar` | `void` |
| `setIncludeDefaultAttributes(include)` | Enable/disable default attribute processing | `include: boolean` | `void` |
| `parseFile(path, encoding?)` | Parses XML from a file | `path: string, encoding?: BufferEncoding` | `void` |
| `parseString(data)` | Parses XML from a string | `data: string` | `void` |

#### Example

```typescript
const parser: SAXParser = new SAXParser();
const builder: DOMBuilder = new DOMBuilder();
parser.setContentHandler(builder);

// Typical usage: just parse the file, validation is automatic if DTD is present
try {
    parser.parseFile('example.xml', 'utf8');
    // Process the parsed document
} catch (error: any) {
    console.error('Parsing failed:', error.message);
}

// Advanced: Only pass a grammar or use DTDParser if you need custom validation or entity resolution.
```

### DOMBuilder

Implements the `ContentHandler` interface to build a DOM tree from SAX events.

#### DOMBuilder Constructor

```typescript
new DOMBuilder()
```

#### DOMBuilder Methods

| Method | Description | Parameters | Returns |
|--------|-------------|------------|---------|
| `getDocument()` | Returns the built XML document | none | `XMLDocument \| undefined` |
| `setCatalog(catalog)` | Sets an entity catalog for resolution | `catalog: Catalog` | `void` |
| `setGrammar(grammar)` | Sets the grammar for validation | `grammar: Grammar` | `void` |
| `setIncludeDefaultAttributes(include)` | Enable/disable default attribute processing | `include: boolean` | `void` |
| `initialize()` | Initializes the builder (called automatically) | none | `void` |

#### DOMBuilder Example

```typescript
const builder: DOMBuilder = new DOMBuilder();
const parser: SAXParser = new SAXParser();
parser.setContentHandler(builder);
parser.parseString('<root><child>Hello World</child></root>');

const doc: XMLDocument | undefined = builder.getDocument();
if (doc) {
    console.log(doc.toString());
}
```

### XMLDocument

Represents a complete XML document with declaration, DTD, root element, and other content.

#### XMLDocument Constructor

```typescript
new XMLDocument()
```

#### XMLDocument Methods

| Method | Description | Parameters | Returns |
|--------|-------------|------------|---------|
| `getRoot()` | Gets the root element | none | `XMLElement \| undefined` |
| `setRoot(root)` | Sets the root element | `root: XMLElement` | `void` |
| `getXmlDeclaration()` | Gets the XML declaration | none | `XMLDeclaration \| undefined` |
| `setXmlDeclaration(decl)` | Sets the XML declaration | `decl: XMLDeclaration` | `void` |
| `getDocumentType()` | Gets the document type declaration | none | `XMLDocumentType \| undefined` |
| `setDocumentType(docType)` | Sets the document type declaration | `docType: XMLDocumentType` | `void` |
| `addComment(comment)` | Adds a comment to the document | `comment: XMLComment` | `void` |
| `addProcessingInstruction(pi)` | Adds a processing instruction | `pi: ProcessingInstruction` | `void` |
| `toString()` | Serializes the document to XML string | none | `string` |
| `equals(node)` | Compares with another node | `node: XMLNode` | `boolean` |

#### XMLDocument Example

```typescript
const doc: XMLDocument = new XMLDocument();
const root: XMLElement = new XMLElement('catalog');
doc.setRoot(root);

// Add XML declaration
const xmlDecl: XMLDeclaration = new XMLDeclaration('1.0', 'UTF-8', 'yes');
doc.setXmlDeclaration(xmlDecl);

console.log(doc.toString());
// Output: <?xml version="1.0" encoding="UTF-8" standalone="yes"?><catalog/>
```

### XMLElement

Represents an XML element with attributes and content.

#### XMLElement Constructor

```typescript
new XMLElement(name: string)
```

#### XMLElement Methods

| Method | Description | Parameters | Returns |
|--------|-------------|------------|---------|
| `getName()` | Gets the element name | none | `string` |
| `getNamespace()` | Gets the namespace prefix | none | `string` |
| `getAttribute(name)` | Gets an attribute by name | `name: string` | `XMLAttribute \| undefined` |
| `setAttribute(attribute)` | Sets an attribute | `attribute: XMLAttribute` | `void` |
| `hasAttribute(name)` | Checks if attribute exists | `name: string` | `boolean` |
| `removeAttribute(name)` | Removes an attribute | `name: string` | `void` |
| `getAttributes()` | Gets all attributes | none | `Array<XMLAttribute>` |
| `addElement(element)` | Adds a child element | `element: XMLElement` | `void` |
| `addString(text)` | Adds text content | `text: string` | `void` |
| `addTextNode(node)` | Adds a text node | `node: TextNode` | `void` |
| `addComment(comment)` | Adds a comment | `comment: XMLComment` | `void` |
| `addCData(cdata)` | Adds CDATA section | `cdata: CData` | `void` |
| `getChildren()` | Gets all child elements | none | `Array<XMLElement>` |
| `getChild(name)` | Gets first child element by name | `name: string` | `XMLElement \| undefined` |
| `removeChild(child)` | Removes a child element | `child: XMLElement` | `void` |
| `getText()` | Gets all text content recursively | none | `string` |
| `toString()` | Serializes to XML string | none | `string` |

#### XMLElement Example

```typescript
const element: XMLElement = new XMLElement('book');
element.setAttribute(new XMLAttribute('id', '123'));
element.addString('Title of the Book');

const author: XMLElement = new XMLElement('author');
author.addString('John Doe');
element.addElement(author);

console.log(element.toString());
// Output: <book id="123">Title of the Book<author>John Doe</author></book>
```

### XMLAttribute

Represents an XML attribute with name and value.

#### XMLAttribute Constructor

```typescript
new XMLAttribute(name: string, value: string)
```

#### XMLAttribute Methods

| Method | Description | Parameters | Returns |
|--------|-------------|------------|---------|
| `getName()` | Gets the attribute name | none | `string` |
| `getValue()` | Gets the attribute value | none | `string` |
| `setvalue(value)` | Sets the attribute value | `value: string` | `void` |
| `getNamespace()` | Gets the namespace prefix | none | `string` |
| `toString()` | Serializes to XML attribute format | none | `string` |

#### XMLAttribute Example

```typescript
const attr: XMLAttribute = new XMLAttribute('lang', 'en-US');
console.log(attr.toString()); // Output: lang="en-US"
```

### XMLWriter

Utility class for writing XML documents to files.

#### XMLWriter Constructor

```typescript
new XMLWriter(file: string)
```

#### XMLWriter Methods

| Method | Description | Parameters | Returns |
|--------|-------------|------------|---------|
| `writeNode(node)` | Writes an XML node to file | `node: XMLNode` | `void` |
| `writeString(str)` | Writes a string to file | `str: string` | `void` |

#### Static Methods

| Method | Description | Parameters | Returns |
|--------|-------------|------------|---------|
| `writeDocument(doc, file)` | Writes complete document to file | `doc: XMLDocument, file: string` | `void` |

#### XMLWriter Example

```typescript
// Write document to file
XMLWriter.writeDocument(document, 'output.xml');

// Or use instance for incremental writing
const writer = new XMLWriter('output.xml');
writer.writeNode(element);
writer.writeString('\n');
```

## Usage Patterns

### Pattern 1: Parse and Modify

```typescript
import { SAXParser, DOMBuilder, XMLWriter } from 'typesxml';

// Parse existing document
const parser: SAXParser = new SAXParser();
const builder: DOMBuilder = new DOMBuilder();
parser.setContentHandler(builder);
parser.parseFile('input.xml');

const doc: XMLDocument | undefined = builder.getDocument();
if (doc) {
    const root: XMLElement | undefined = doc.getRoot();
    if (root) {
        // Modify the document
        root.setAttribute(new XMLAttribute('modified', 'true'));
        
        // Add new child
        const newChild: XMLElement = new XMLElement('timestamp');
        newChild.addString(new Date().toISOString());
        root.addElement(newChild);
    }
    
    // Write modified document
    XMLWriter.writeDocument(doc, 'output.xml');
}
// Note: DTD validation is automatic if the document includes a DTD. Manual grammar handling is only needed for advanced use cases.
```

### Pattern 2: Create Document from Scratch

```typescript
import { XMLDocument, XMLElement, XMLAttribute, XMLDeclaration } from 'typesxml';

// Create new document
const doc: XMLDocument = new XMLDocument();

// Add XML declaration
doc.setXmlDeclaration(new XMLDeclaration('1.0', 'UTF-8', 'yes'));

// Create root element
const root: XMLElement = new XMLElement('catalog');
root.setAttribute(new XMLAttribute('version', '1.0'));

// Add content
const book: XMLElement = new XMLElement('book');
book.setAttribute(new XMLAttribute('id', 'b1'));
book.addString('Learning TypeScript');
root.addElement(book);

doc.setRoot(root);

// Output XML
console.log(doc.toString());
```

### Pattern 3: Custom Content Handler

```typescript
import { ContentHandler, SAXParser, XMLAttribute, Grammar, Catalog } from 'typesxml';

class CustomHandler implements ContentHandler {
    private depth = 0;
    private grammar?: Grammar;
    
    initialize(): void {
        console.log('Document parsing started');
    }
    
    setCatalog(catalog: Catalog): void {
        console.log('Catalog set for entity resolution');
    }
    
    setGrammar(grammar: Grammar): void {
        this.grammar = grammar;
        console.log('Grammar set for validation:', grammar.getType());
    }
    
    setIncludeDefaultAttributes(include: boolean): void {
        console.log('Include default attributes:', include);
    }
    
    startElement(name: string, atts: XMLAttribute[]): void {
        const indent = '  '.repeat(this.depth);
        console.log(`${indent}<${name}>`);
        this.depth++;
    }
    
    endElement(name: string): void {
        this.depth--;
        const indent = '  '.repeat(this.depth);
        console.log(`${indent}</${name}>`);
    }
    
    characters(ch: string): void {
        if (ch.trim()) {
            const indent = '  '.repeat(this.depth);
            console.log(`${indent}Text: ${ch.trim()}`);
        }
    }
    
    // Implement other required methods...
    startDocument() {}
    endDocument() {}
    xmlDeclaration() {}
    internalSubset() {}
    ignorableWhitespace() {}
    comment() {}
    processingInstruction() {}
    startCDATA() {}
    endCDATA() {}
    startDTD() {}
    endDTD() {}
    skippedEntity() {}
}

const parser: SAXParser = new SAXParser();
parser.setContentHandler(new CustomHandler());
parser.parseString('<root><child>Hello</child></root>');
```

## Node Types

All XML nodes implement the `XMLNode` interface and have a node type constant from the `Constants` class:

```typescript
import { Constants } from 'typesxml';

Constants.DOCUMENT_NODE              // 0
Constants.ELEMENT_NODE               // 1
Constants.ATTRIBUTE_NODE             // 2
Constants.CDATA_SECTION_NODE         // 3
Constants.COMMENT_NODE               // 4
Constants.PROCESSING_INSTRUCTION_NODE // 5
Constants.TEXT_NODE                  // 6
Constants.XML_DECLARATION_NODE       // 8
Constants.DOCUMENT_TYPE_NODE         // 10
```

## Utility Classes

### XMLUtils

Provides various XML utility functions:

```typescript
import { XMLUtils } from 'typesxml';

// String cleaning and escaping
XMLUtils.cleanString(text)      // Escapes XML characters (&, <, >)
XMLUtils.unquote(text)          // Escapes quotes
XMLUtils.normalizeSpaces(text)  // Normalizes whitespace

// Character validation
XMLUtils.isXmlSpace(char)       // Checks if character is XML whitespace
XMLUtils.validXml10Chars(text)  // Filters valid XML 1.0 characters
XMLUtils.validXml11Chars(text)  // Filters valid XML 1.1 characters

// String manipulation
XMLUtils.replaceAll(text, search, replacement)
XMLUtils.normalizeLines(text)   // Normalizes line endings
```

### FileReader

Handles file reading with encoding detection:

```typescript
import { FileReader } from 'typesxml';

// Detect encoding of XML file
const encoding: BufferEncoding = FileReader.detectEncoding('file.xml');

// Read with specific encoding
const reader: FileReader = new FileReader('file.xml', 'utf8');
const content: string = reader.read();
reader.closeFile();
```

## Grammar Framework

TypesXML automatically handles DTD and XML Schema validation when present in XML documents. Most developers don't need to interact with the Grammar framework directly.

### Automatic Validation

```typescript
import { SAXParser, DOMBuilder } from 'typesxml';

const parser = new SAXParser();
const builder = new DOMBuilder();
parser.setContentHandler(builder);

// The library automatically detects and processes DTD/Schema declarations
// No manual grammar setup required
parser.parseFile('document-with-dtd.xml');
const doc = builder.getDocument();

// Default attributes from DTD are automatically applied
// Schema validation happens automatically if present
```

### Validation Modes

```typescript
// Strict validation - throws errors for invalid documents
parser.setValidating(true);

// Helpful mode (default) - processes DTD/Schema but doesn't reject invalid documents
parser.setValidating(false);
```

### Catalog Support

For resolving external DTD and Schema references:

```typescript
import { Catalog } from 'typesxml';

const catalog = new Catalog('catalog.xml');
const builder = new DOMBuilder();
builder.setCatalog(catalog);

const parser = new SAXParser();
parser.setContentHandler(builder);
parser.parseFile('document.xml'); // External references resolved via catalog
```

## Error Handling

The library throws descriptive errors for various parsing issues:

```typescript
try {
    parser.parseString('<invalid><xml>');
} catch (error) {
    if (error instanceof Error) {
        console.error('Parse error:', error.message);
        // Common errors:
        // - "Malformed XML document: unclosed elements"
        // - "Malformed XML document: text found in prolog"
        // - "ContentHandler not set"
    }
}
```

## Examples

### Example 1: Processing a Configuration File

```typescript
import { SAXParser, DOMBuilder, XMLElement, XMLAttribute } from 'typesxml';

function updateConfig(configFile: string, key: string, value: string): void {
    const parser = new SAXParser();
    const builder = new DOMBuilder();
    parser.setContentHandler(builder);
    parser.parseFile(configFile);
    
    const doc = builder.getDocument();
    if (!doc) return;
    
    const root = doc.getRoot();
    if (!root) return;
    
    // Find or create setting
    let setting = root.getChild('setting');
    if (!setting) {
        setting = new XMLElement('setting');
        root.addElement(setting);
    }
    
    setting.setAttribute(new XMLAttribute('key', key));
    setting.setAttribute(new XMLAttribute('value', value));
    
    // Write back
    XMLWriter.writeDocument(doc, configFile);
}
```

### Example 3: Streaming Large XML Files

```typescript
import { ContentHandler, SAXParser, XMLAttribute } from 'typesxml';

class StreamingProcessor implements ContentHandler {
    private currentPath: string[] = [];
    private recordCount = 0;
    
    initialize(): void {
        console.log('Starting to process large XML file...');
    }
    
    startElement(name: string, atts: XMLAttribute[]): void {
        this.currentPath.push(name);
        
        // Process specific elements without building DOM
        if (this.currentPath.join('/') === 'database/records/record') {
            this.recordCount++;
            if (this.recordCount % 1000 === 0) {
                console.log(`Processed ${this.recordCount} records`);
            }
        }
    }
    
    endElement(name: string): void {
        this.currentPath.pop();
    }
    
    endDocument(): void {
        console.log(`Total records processed: ${this.recordCount}`);
    }
    
    // Implement other required methods...
    setCatalog() {}
    startDocument() {}
    xmlDeclaration() {}
    internalSubset() {}
    characters() {}
    ignorableWhitespace() {}
    comment() {}
    processingInstruction() {}
    startCDATA() {}
    endCDATA() {}
    startDTD() {}
    endDTD() {}
    skippedEntity() {}
}

// Process large file without loading entire DOM
const parser = new SAXParser();
parser.setContentHandler(new StreamingProcessor());
parser.parseFile('large-database.xml');
```

This documentation provides a comprehensive guide to using the TypesXML library effectively. The API reference, usage patterns, and examples should make it much easier for developers and AI assistants to understand and work with the library.
