# TypesXML API Documentation

## Table of Contents

1. [Overview](#overview)
2. [Quick Start Guide](#quick-start-guide)
3. [Core Classes](#core-classes)
4. [Usage Patterns](#usage-patterns)
5. [Node Types](#node-types)
6. [Utility Classes](#utility-classes)
7. [Grammar Framework](#grammar-framework)
8. [DTD Support](#dtd-support)
9. [Error Handling](#error-handling)
10. [Examples](#examples)

## Overview

TypesXML is an open-source XML library written in TypeScript that provides both SAX (event-driven) and DOM (tree-based) parsing capabilities. It implements a complete XML 1.0/1.1 parser with extensible grammar-based validation framework supporting multiple schema types.

### Key Features

- **Multi-Schema Validation Framework**: Extensible Grammar interface supporting DTD and XML Schema validation
- **SAX Parser**: Event-driven parsing for memory-efficient processing of large XML files
- **DOM Builder**: Creates an in-memory tree representation of XML documents
- **Complete DTD Support**: Full parsing and validation of Document Type Definitions
- **XML Schema Support**: Comprehensive XSD validation with 76% W3C test suite success rate
- **DTD Validation**: Strict validation against DTD constraints including sequences, choices, and cardinality
- **XML Writer**: Utilities for writing XML documents to files
- **Encoding Support**: Handles various character encodings including UTF-8, UTF-16LE
- **Entity Resolution**: Built-in support for XML entities and catalog-based resolution
- **Namespace Support**: Full XML namespace handling
- **Flexible Validation**: Grammar-based validation with configurable strictness levels

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

TypesXML implements an extensible Grammar framework that provides a unified interface for multi-schema validation. The framework supports DTD, XML Schema, and RelaxNG validation through a common abstraction layer.

### Grammar Interface

The core `Grammar` interface defines validation methods that work across different schema types:

```typescript
import { 
    Grammar, 
    GrammarType, 
    QualifiedName, 
    ValidationContext, 
    ValidationResult,
    AttributeInfo 
} from 'typesxml';

interface Grammar {
    getType(): GrammarType;
    
    // Element validation
    validateElement(elementName: QualifiedName, context: ValidationContext): ValidationResult;
    getElementContentModel(elementName: QualifiedName): ContentModel | undefined;
    
    // Attribute validation
    validateAttributes(elementName: QualifiedName, attributes: Map<QualifiedName, string>, context: ValidationContext): ValidationResult;
    getElementAttributes(elementName: QualifiedName): Map<QualifiedName, AttributeInfo>;
    getDefaultAttributes(elementName: QualifiedName): Map<QualifiedName, string>;
    
    // Content validation
    validateElementContent(elementName: QualifiedName, children: QualifiedName[], textContent: string, context: ValidationContext): ValidationResult;
    
    // Type validation
    validateAttributeValue(elementName: QualifiedName, attributeName: QualifiedName, value: string, context: ValidationContext): ValidationResult;
    
    // Entity resolution
    getEntityValue(entityName: string): string | undefined;
    hasEntity(entityName: string): boolean;
    
    // Notation support
    getNotation(notationName: string): NotationDecl | undefined;
    hasNotation(notationName: string): boolean;
    
    // Schema information
    getTargetNamespace(): string | undefined;
    getSchemaLocation(): string | undefined;
}
```

### Grammar Types

```typescript
enum GrammarType {
    NONE = 'none',
    DTD = 'dtd',
    XML_SCHEMA = 'xml-schema'
}
```

### QualifiedName System

The framework uses `QualifiedName` for namespace-aware processing:

```typescript
import { QualifiedName } from 'typesxml';

// Create qualified names
const element = new QualifiedName('book', 'http://example.com/books', 'bk');
const attribute = new QualifiedName('id');

console.log(element.getLocalName()); // 'book'
console.log(element.getNamespaceURI()); // 'http://example.com/books'
console.log(element.getPrefix()); // 'bk'
console.log(element.toString()); // 'bk:book'
```

### Validation Context and Results

```typescript
import { ValidationContext, ValidationResult, ValidationError, ValidationWarning } from 'typesxml';

// Create validation context
const context: ValidationContext = new ValidationContext();
context.setCurrentElement('book');
context.setCurrentLine(25);
context.setCurrentColumn(10);

// Create validation results
const success: ValidationResult = ValidationResult.success();
const error: ValidationResult = ValidationResult.error('Element not allowed here', 'invalid');
const warning: ValidationResult = ValidationResult.warning('Deprecated element usage', 'old-element');

// Check results
if (error.hasErrors()) {
    error.getErrors().forEach((err: ValidationError) => {
        console.log(`Error at line ${err.getLine()}: ${err.getMessage()}`);
    });
}
```

### Grammar Implementations

#### NoOpGrammar

Provides a no-operation grammar for documents without schema validation:

```typescript
import { NoOpGrammar } from 'typesxml';

const noOpGrammar = new NoOpGrammar();
console.log(noOpGrammar.getType()); // GrammarType.NONE

// All validation methods return success
const result = noOpGrammar.validateElement(new QualifiedName('any'), new ValidationContext());
console.log(result.isValid()); // true
```

#### DTDGrammar

Wraps existing DTD functionality in the Grammar interface:

```typescript
import { DTDGrammar, DTDParser } from 'typesxml';

// Create DTDGrammar from DTD file
const dtdParser: DTDParser = new DTDParser();
const dtdGrammar: DTDGrammar = dtdParser.parseDTD('schema.dtd');

console.log(dtdGrammar.getType()); // GrammarType.DTD

// Access DTD-specific functionality
const elementDecls: Map<string, ElementDecl> = dtdGrammar.getElementDeclMap();
const attributeDecls: Map<string, Map<string, AttDecl>> = dtdGrammar.getAttributesMap();
const entities: Map<string, EntityDecl> = dtdGrammar.getEntitiesMap();

// Use Grammar interface methods (developer-friendly)
const contentModel: ContentModel | undefined = dtdGrammar.getElementContentModel('book');
const defaultAttrs: Map<string, string> = dtdGrammar.getDefaultAttributes('book');
```

### Using Grammars with SAXParser

```typescript
import { SAXParser, DOMBuilder, DTDParser, NoOpGrammar } from 'typesxml';

const parser = new SAXParser();
const builder = new DOMBuilder();
parser.setContentHandler(builder);

// Option 1: Use DTD grammar
const dtdParser = new DTDParser();
const dtdGrammar = dtdParser.parseDTD('schema.dtd');
parser.setGrammar(dtdGrammar);
parser.setValidating(true); // Enable strict validation

// Option 2: Use no-op grammar (no validation)
const noOpGrammar = new NoOpGrammar();
parser.setGrammar(noOpGrammar);
parser.setValidating(false);

// Option 3: Let parser use default (automatic DTD detection)
// parser.setGrammar() not called - parser will auto-detect DTD from document

parser.parseFile('document.xml');
```

### Attribute Information

```typescript
import { AttributeInfo, QualifiedName } from 'typesxml';

const attrInfo = new AttributeInfo(
    new QualifiedName('id'),
    'ID',
    undefined, // no default value
    '#REQUIRED'
);

console.log(attrInfo.getName().getLocalName()); // 'id'
console.log(attrInfo.getType()); // 'ID'
console.log(attrInfo.hasDefaultValue()); // false
console.log(attrInfo.getDefaultDecl()); // '#REQUIRED'
```

### Grammar Framework Benefits

1. **Unified Validation**: Single interface for all schema types
2. **Namespace Support**: Full namespace handling with QualifiedName
3. **Extensibility**: Easy to add new schema types (XML Schema, RelaxNG)
4. **Detailed Validation**: Rich error reporting with line/column information
5. **Flexible Processing**: Choose validation strictness levels
6. **Backward Compatibility**: Existing DTD code continues to work

## DTD Support

The library includes comprehensive DTD (Document Type Definition) support through the Grammar framework, with complete DTDGrammar implementation, full validation, and default attribute processing:

### Key DTD Features

- **Complete DTD Parsing**: Full support for element, attribute, entity, and notation declarations
- **Grammar Integration**: DTD functionality wrapped in the unified Grammar interface
- **Full DTD Validation**: Complete validation against DTD constraints including element sequences, choice groups, and cardinality
- **Flexible Validation Modes**: Strict validation with `setValidating(true)` or helpful processing with `setValidating(false)`
- **Default Attribute Processing**: Automatic setting of default attribute values from DTD
- **Content Model Validation**: Complete validation of element content against DTD-declared models
- **Catalog Support**: XML Catalog resolution for DTD and entity references
- **Helpful Behavior**: DTD parsing and default attributes work even in non-validating mode

### DTD Parser and Grammar

```typescript
import { 
    DTDParser, 
    DTDGrammar,
    ContentModel,
    ElementDecl, 
    AttListDecl, 
    EntityDecl, 
    NotationDecl,
    InternalSubset,
    SAXParser,
    DOMBuilder,
    Catalog
} from 'typesxml';

// Typical developer usage does not require manual DTD parsing or grammar setup.
// Just parse the XML file and DTD validation/default attributes are handled automatically if a DTD is present.
const parser = new SAXParser();
const builder = new DOMBuilder();
parser.setContentHandler(builder);
parser.parseFile('document.xml');
const doc = builder.getDocument();

// Advanced: Only use DTDParser and manual grammar setup for custom entity resolution or merging grammars.
```

### Validation and Default Attributes

#### Setting Validation Mode

```typescript
const parser = new SAXParser();
const builder = new DOMBuilder();

// Enable strict DTD validation - rejects documents that don't conform to DTD
parser.setValidating(true);
parser.setContentHandler(builder);

// Helpful mode (default): DTD parsing and default attributes without strict validation
parser.setValidating(false);
parser.setContentHandler(builder);
```

#### DTD Validation Examples

```typescript
// Example: Strict validation with detailed error reporting
const invalidXml = `<?xml version="1.0"?>
<!DOCTYPE book [
  <!ELEMENT book (title, author+, chapter*)>
  <!ELEMENT title (#PCDATA)>
  <!ELEMENT author (#PCDATA)>
  <!ELEMENT chapter (title, content)>
  <!ELEMENT content (#PCDATA)>
]>
<book>
  <title>Book Title</title>
  <!-- Missing required author+ elements - validation will fail -->
  <chapter>
    <title>Chapter</title>
    <content>Content</content>
  </chapter>
</book>`;

const parser = new SAXParser();
const builder = new DOMBuilder();
parser.setValidating(true); // Enable strict validation
parser.setContentHandler(builder);

try {
    parser.parseString(invalidXml);
    console.log('Document is valid according to DTD');
} catch (error) {
    console.log('DTD Validation Error:', error.message);
    // Output: "Content model validation failed for element 'book': Required content particle '(title,author+,chapter*)' not satisfied"
}
```

#### Default Attribute Processing

Default attributes are automatically set based on DTD declarations:

```typescript
// DTD declares: <!ATTLIST concept class CDATA "- topic/topic concept/concept ">
// Input XML: <concept id="example">
// Result:     <concept id="example" class="- topic/topic concept/concept ">

const ditaXml = `<?xml version="1.0"?>
<!DOCTYPE concept PUBLIC "-//OASIS//DTD DITA Concept//EN" "concept.dtd">
<concept id="example">
    <title>Example</title>
</concept>`;

parser.parseString(ditaXml);
const doc = builder.getDocument();
const root = doc?.getRoot();

// Default @class attribute is automatically set
console.log(root?.getAttribute('class')?.getValue()); 
// Output: "- topic/topic concept/concept "
```

#### Supported Default Attribute Types

1. **Direct defaults**: `attr CDATA "default-value"`
2. **Fixed declarations**: `attr CDATA #FIXED "fixed-value"`  
3. **Enumeration defaults**: `format (html|dita) "dita"`
4. **Required attributes**: `attr CDATA #REQUIRED` (must be present)
5. **Implied attributes**: `attr CDATA #IMPLIED` (no default set)

#### DITA Processing Support

Perfect for DITA workflows where `@class` attributes are essential:

```typescript
// All DITA elements automatically get proper @class attributes
const ditaElements = doc?.getElementsByTagName('*');
ditaElements?.forEach(element => {
    const classAttr = element.getAttribute('class');
    if (classAttr) {
        console.log(`${element.getName()}: ${classAttr.getValue()}`);
    }
});
// Output:
// concept: - topic/topic concept/concept 
// title: - topic/title 
// p: - topic/p 
```

### DTDGrammar Class

The `DTDGrammar` class implements the Grammar interface and represents a complete parsed DTD with all its components:

#### DTDGrammar Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `getType()` | Get grammar type | `GrammarType.DTD` |
| `validateElement(elementName, context)` | Validate element existence | `ValidationResult` |
| `getElementContentModel(elementName)` | Get content model for an element | `ContentModel \| undefined` |
| `validateAttributes(elementName, attributes, context)` | Validate element attributes | `ValidationResult` |
| `getElementAttributes(elementName)` | Get attribute info for element | `Map<QualifiedName, AttributeInfo>` |
| `getDefaultAttributes(elementName)` | Get default attributes for element | `Map<QualifiedName, string>` |
| `validateElementContent(elementName, children, textContent, context)` | Validate element content | `ValidationResult` |
| `validateAttributeValue(elementName, attributeName, value, context)` | Validate attribute value | `ValidationResult` |
| `getEntityValue(entityName)` | Get entity value | `string \| undefined` |
| `hasEntity(entityName)` | Check if entity exists | `boolean` |
| `getNotation(notationName)` | Get notation declaration | `NotationDecl \| undefined` |
| `hasNotation(notationName)` | Check if notation exists | `boolean` |

#### DTD-Specific Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `getElementDeclMap()` | Get all element declarations | `Map<string, ElementDecl>` |
| `getAttributesMap()` | Get all attribute declarations | `Map<string, Map<string, AttDecl>>` |
| `getEntitiesMap()` | Get all entity declarations | `Map<string, EntityDecl>` |
| `getNotationsMap()` | Get all notation declarations | `Map<string, NotationDecl>` |
| `addElement(elementDecl)` | Add element declaration | `void` |
| `addAttributes(element, attributes)` | Add attribute declarations | `void` |
| `addEntity(entityDecl)` | Add entity declaration | `void` |
| `addNotation(notation)` | Add notation declaration | `void` |
| `merge(grammar)` | Merge with another DTDGrammar | `void` |

#### DTDGrammar Usage Example

```typescript
// Parse DTD
const dtdGrammar = dtdParser.parseDTD('bookstore.dtd');

// Check element structure using Grammar interface
const bookModel: ContentModel | undefined = dtdGrammar.getElementContentModel('book');
if (bookModel) {
    console.log('Book content type:', bookModel.getType());
    console.log('Book children:', [...bookModel.getChildren()]);
}

// Check attributes for an element using Grammar interface
const bookAttributes: Map<string, AttributeInfo> = dtdGrammar.getElementAttributes('book');
bookAttributes.forEach((attrInfo: AttributeInfo, attrName: string) => {
    console.log(`${attrName}: ${attrInfo.getType()} = ${attrInfo.getDefaultValue()}`);
});

// Access DTD-specific functionality
const elementDecls: Map<string, ElementDecl> = dtdGrammar.getElementDeclMap();
const bookElementDecl: ElementDecl | undefined = elementDecls.get('book');
if (bookElementDecl) {
    console.log('Book element spec:', bookElementDecl.getContentSpec());
}

// Access entities through Grammar interface
const copyrightText: string | undefined = dtdGrammar.getEntityValue('copyright');
if (copyrightText) {
    console.log('Copyright text:', copyrightText);
}
```

### ContentModel Class

The `ContentModel` class represents the content structure of XML elements:

#### Content Model Types

- **EMPTY**: Element cannot contain any content
- **ANY**: Element can contain any content
- **Mixed**: Element contains #PCDATA mixed with child elements
- **Children**: Element contains only child elements (sequences/choices)

#### ContentModel Instance Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `getType()` | Get content model type | `'EMPTY' \| 'ANY' \| 'Mixed' \| 'Children'` |
| `getContent()` | Get content particles array | `Array<ContentParticle>` |
| `getChildren()` | Get set of child element names | `Set<string>` |
| `isMixed()` | Check if content is mixed | `boolean` |
| `toString()` | Get string representation | `string` |

#### ContentModel Static Methods

| Method | Description | Parameters | Returns |
|--------|-------------|------------|---------|
| `ContentModel.parse(modelString)` | Parse content model from string | `modelString: string` | `ContentModel` |

#### ContentModel Usage Example

```typescript
// Parse content model from DTD declaration
const bookModel = ContentModel.parse('(title, author+, (chapter | appendix)+)');

console.log('Content type:', bookModel.getType()); // 'Children'
console.log('String form:', bookModel.toString()); // '(title,author+,(chapter|appendix)+)'
console.log('Child elements:', [...bookModel.getChildren()]); // ['title', 'author', 'chapter', 'appendix']

// Check for mixed content
const paraModel = ContentModel.parse('(#PCDATA | em | strong)*');
console.log('Is mixed:', paraModel.isMixed()); // true
console.log('Inline elements:', [...paraModel.getChildren()]); // ['em', 'strong']
```

### Content Particles

Content models are composed of particles representing different content types:

#### ContentParticle Types

- **DTDName**: Represents a child element name
- **DTDChoice**: Represents alternatives (A | B | C)
- **DTDSecuence**: Represents sequences (A, B, C)
- **DTDPCData**: Represents #PCDATA content

#### DTD Content Particle Classes

```typescript
import { DTDName, DTDChoice, DTDSecuence, DTDPCData, ContentParticle } from 'typesxml';

// Create element name particle
const titleParticle = new DTDName('title');
console.log(titleParticle.getName()); // 'title'
console.log(titleParticle.getType()); // ContentParticleType.NAME

// Create choice particle (author | editor)
const choice = new DTDChoice();
choice.addParticle(new DTDName('author'));
choice.addParticle(new DTDName('editor'));
choice.setCardinality(Cardinality.ONEMANY); // +
console.log(choice.toString()); // '(author|editor)+'

// Create sequence particle (title, subtitle?)
const sequence = new DTDSecuence();
sequence.addParticle(new DTDName('title'));
const subtitle = new DTDName('subtitle');
subtitle.setCardinality(Cardinality.OPTIONAL); // ?
sequence.addParticle(subtitle);
console.log(sequence.toString()); // '(title,subtitle?)'

// Create mixed content with PCDATA
const mixed = new DTDChoice();
mixed.addParticle(new DTDPCData());
mixed.addParticle(new DTDName('em'));
mixed.addParticle(new DTDName('strong'));
mixed.setCardinality(Cardinality.ZEROMANY); // *
console.log(mixed.toString()); // '(#PCDATA|em|strong)*'
```

#### Cardinality Support

All particles support XML cardinality operators:

- **NONE** (default): Exactly one occurrence
- **OPTIONAL** (?): Zero or one occurrence
- **ZEROMANY** (*): Zero or more occurrences
- **ONEMANY** (+): One or more occurrences

```typescript
import { Cardinality } from 'typesxml';

const particle = new DTDName('chapter');
particle.setCardinality(Cardinality.ONEMANY);
console.log(particle.toString()); // 'chapter+'
console.log(particle.getCardinality()); // 3 (ONEMANY)
```

### DTD Parser

#### DTDParser

```typescript
import { DTDParser, DTDGrammar } from 'typesxml';

const dtdParser = new DTDParser();

// Parse external DTD file
const dtdGrammar = dtdParser.parseDTD('schema.dtd');
console.log(dtdGrammar.getType()); // GrammarType.DTD

// Parse internal subset
const internalDTD = `
<!ELEMENT book (title, author+)>
<!ATTLIST book id ID #REQUIRED>
<!ENTITY copyright "Copyright 2025">
`;
const internalGrammar = dtdParser.parseInternalSubset(internalDTD);

// Use with catalog for entity resolution
const catalog = new Catalog('catalog.xml');
dtdParser.setCatalog(catalog);
const resolvedGrammar = dtdParser.parseDTD('schema.dtd');
```

### DTD Declarations

#### ElementDecl

```typescript
const dtdGrammar = dtdParser.parseDTD('schema.dtd');
const elementDecl = dtdGrammar.getElementDeclMap().get('book');
if (elementDecl) {
    console.log('Element name:', elementDecl.getName());
    console.log('Content spec:', elementDecl.getContentSpec());
}
```

#### AttDecl (Attribute Declaration)

```typescript
// Access through DTDGrammar DTD-specific methods
const bookAttributes = dtdGrammar.getAttributesMap().get('book');
const idAttr = bookAttributes?.get('id');
if (idAttr) {
    console.log('Attribute name:', idAttr.getName());
    console.log('Attribute type:', idAttr.getType()); // 'ID', 'CDATA', etc.
    console.log('Default value:', idAttr.getDefaultValue());
    console.log('Default declaration:', idAttr.getDefaultDecl()); // '#REQUIRED', '#IMPLIED', etc.
}

// Or access through Grammar interface (developer-friendly)
const attributeInfos = dtdGrammar.getElementAttributes('book');
attributeInfos.forEach((attrInfo, name) => {
    console.log(`${name}: ${attrInfo.getType()}`);
    if (attrInfo.hasDefaultValue()) {
        console.log(`  Default: ${attrInfo.getDefaultValue()}`);
    }
});
```

#### EntityDecl

```typescript
// Access through DTDGrammar DTD-specific methods
const entities = dtdGrammar.getEntitiesMap();
entities.forEach((entity, name) => {
    console.log(`Entity ${name}:`, entity.getValue());
    console.log('Is parameter entity:', entity.isParameterEntity());
});

// Or access through Grammar interface
const copyrightValue = dtdGrammar.getEntityValue('copyright');
if (copyrightValue) {
    console.log('Copyright entity value:', copyrightValue);
}

console.log('Has entity:', dtdGrammar.hasEntity('copyright')); // true/false
```

#### NotationDecl

```typescript
// Access through DTDGrammar DTD-specific methods
const notations = dtdGrammar.getNotationsMap();
notations.forEach((notation, name) => {
    console.log(`Notation ${name}:`);
    console.log('Public ID:', notation.getPublicId());
    console.log('System ID:', notation.getSystemId());
});

// Or access through Grammar interface
const gifNotation = dtdGrammar.getNotation('gif');
if (gifNotation) {
    console.log('GIF notation found:', gifNotation.getSystemId());
}

console.log('Has notation:', dtdGrammar.hasNotation('gif')); // true/false
```

### Catalog Support

```typescript
import { Catalog } from 'typesxml';

const catalog = new Catalog();
// Use catalog for entity resolution
const builder = new DOMBuilder();
builder.setCatalog(catalog);
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
