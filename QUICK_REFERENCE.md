# TypesXML Quick Reference

## Quick Start Cheat Sheet

### 1. Basic Parsing (String)

```typescript
import { SAXParser, DOMBuilder } from 'typesxml';

const parser = new SAXParser();
const builder = new DOMBuilder();
parser.setContentHandler(builder);
parser.parseString('<root><child>text</child></root>');
const doc = builder.getDocument();
```

### 2. Basic Parsing (File)

```typescript
import { SAXParser, DOMBuilder } from 'typesxml';

const parser = new SAXParser();
const builder = new DOMBuilder();
parser.setContentHandler(builder);
parser.parseFile('document.xml');
const doc = builder.getDocument();
```

### 3. Grammar-Based Parsing with DTD

```typescript
import { SAXParser, DOMBuilder, DTDParser } from 'typesxml';

const parser = new SAXParser();
const builder = new DOMBuilder();
const dtdParser = new DTDParser();

// Create DTD grammar
const dtdGrammar = dtdParser.parseDTD('schema.dtd');

// Configure parser with grammar
parser.setGrammar(dtdGrammar);
parser.setValidating(true); // Enable strict validation
parser.setIncludeDefaultAttributes(true); // Include default attributes
parser.setContentHandler(builder);

parser.parseFile('document.xml');
const doc = builder.getDocument();
```

### 4. Creating XML from Scratch

```typescript
import { XMLDocument, XMLElement, XMLAttribute, XMLDeclaration } from 'typesxml';

const doc = new XMLDocument();
doc.setXmlDeclaration(new XMLDeclaration('1.0', 'UTF-8'));

const root = new XMLElement('catalog');
root.setAttribute(new XMLAttribute('version', '1.0'));

const item = new XMLElement('item');
item.setAttribute(new XMLAttribute('id', '123'));
item.addString('Item Text');
root.addElement(item);

doc.setRoot(root);
console.log(doc.toString());
```

### 5. Writing to File

```typescript
import { XMLWriter } from 'typesxml';

// Write complete document
XMLWriter.writeDocument(document, 'output.xml');

// Or incremental writing
const writer = new XMLWriter('output.xml');
writer.writeNode(element);
writer.writeString('\n');
```

## Grammar Framework

### Working with Grammars

```typescript
import { DTDGrammar, NoOpGrammar, QualifiedName } from 'typesxml';

// Create DTD grammar from file
const dtdParser = new DTDParser();
const dtdGrammar = dtdParser.parseDTD('schema.dtd');

// Create no-op grammar (no validation)
const noOpGrammar = new NoOpGrammar();

// Use grammar with parser
parser.setGrammar(dtdGrammar); // or noOpGrammar
```

### QualifiedName for Namespace Support

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
import { ValidationContext, ValidationResult, ValidationError } from 'typesxml';

// Check validation results
const context = new ValidationContext();
const result = grammar.validateElement(elementName, context);

if (result.hasErrors()) {
    result.getErrors().forEach(error => {
        console.log(`Error: ${error.getMessage()}`);
        if (error.getLine()) {
            console.log(`  at line ${error.getLine()}`);
        }
    });
}
```

### Grammar Types

```typescript
import { GrammarType } from 'typesxml';

// Check grammar type
switch (grammar.getType()) {
    case GrammarType.DTD:
        console.log('DTD grammar');
        break;
    case GrammarType.NONE:
        console.log('No-op grammar');
        break;
    case GrammarType.XML_SCHEMA:
        console.log('XML Schema grammar');
        break;
    case GrammarType.RELAX_NG:
        console.log('RelaxNG grammar');
        break;
}
```

## Common Operations

### Working with Elements

```typescript
// Create element
const element = new XMLElement('book');

// Add attributes
element.setAttribute(new XMLAttribute('id', '123'));
element.setAttribute(new XMLAttribute('lang', 'en'));

// Add text content
element.addString('Book Title');

// Add child elements
const author = new XMLElement('author');
author.addString('John Doe');
element.addElement(author);

// Get children
const children = element.getChildren();
const firstChild = element.getChild('author');

// Get attributes
const id = element.getAttribute('id')?.getValue();
const allAttributes = element.getAttributes();

// Get text content (recursive)
const textContent = element.getText();
```

### Working with Documents

```typescript
// Access document parts
const root = document.getRoot();
const declaration = document.getXmlDeclaration();
const docType = document.getDocumentType();

// Add document-level content
document.addComment(new XMLComment('This is a comment'));
document.addProcessingInstruction(new ProcessingInstruction('target', 'data'));
```

### Navigation and Searching

```typescript
// Find elements by name
const root = document.getRoot();
const children = root?.getChildren();
const specificChild = root?.getChild('targetElement');

// Remove elements
root?.removeChild(specificChild);

// Check for attributes
if (element.hasAttribute('id')) {
    const id = element.getAttribute('id')?.getValue();
}
```

## Error Handling Patterns

```typescript
try {
    parser.parseFile('document.xml');
    const doc = builder.getDocument();
    if (!doc) {
        throw new Error('Failed to build document');
    }
    // Process document...
} catch (error) {
    if (error instanceof Error) {
        console.error('Parse error:', error.message);
    }
}
```

## Common Use Cases

### 1. Configuration File Processing

```typescript
function updateConfig(file: string, key: string, value: string) {
    const parser = new SAXParser();
    const builder = new DOMBuilder();
    parser.setContentHandler(builder);
    parser.parseFile(file);
    
    const doc = builder.getDocument();
    const root = doc?.getRoot();
    
    // Find or create setting
    let setting = root?.getChild('setting');
    if (!setting) {
        setting = new XMLElement('setting');
        root?.addElement(setting);
    }
    
    setting.setAttribute(new XMLAttribute('key', key));
    setting.setAttribute(new XMLAttribute('value', value));
    
    XMLWriter.writeDocument(doc!, file);
}
```

### 2. Data Transformation

```typescript
function transformXML(inputFile: string, outputFile: string) {
    const parser = new SAXParser();
    const builder = new DOMBuilder();
    parser.setContentHandler(builder);
    parser.parseFile(inputFile);
    
    const doc = builder.getDocument();
    const root = doc?.getRoot();
    
    // Transform data
    root?.getChildren().forEach(child => {
        if (child.getName() === 'oldElement') {
            child.setAttribute(new XMLAttribute('transformed', 'true'));
        }
    });
    
    XMLWriter.writeDocument(doc!, outputFile);
}
```

### 3. XML Validation/Inspection

```typescript
function validateStructure(xmlString: string): boolean {
    try {
        const parser = new SAXParser();
        const builder = new DOMBuilder();
        parser.setContentHandler(builder);
        parser.parseString(xmlString);
        
        const doc = builder.getDocument();
        const root = doc?.getRoot();
        
        // Check required structure
        return root?.getName() === 'expectedRoot' && 
               root?.getChild('requiredChild') !== undefined;
    } catch {
        return false;
    }
}
```

## Node Type Constants

```typescript
import { Constants } from 'typesxml';

switch (node.getNodeType()) {
    case Constants.ELEMENT_NODE:
        // Handle element
        break;
    case Constants.TEXT_NODE:
        // Handle text
        break;
    case Constants.COMMENT_NODE:
        // Handle comment
        break;
    // ... other types
}
```

## Utility Functions

```typescript
import { XMLUtils } from 'typesxml';

// Clean strings for XML
const cleaned = XMLUtils.cleanString(userInput);

// Check whitespace
if (XMLUtils.isXmlSpace(char)) {
    // Handle whitespace
}

// Validate characters
const validText = XMLUtils.validXml10Chars(text);
```

## DTD Grammar Support

### Basic Setup with DTD Grammar

```typescript
import { SAXParser, DOMBuilder, DTDParser, Catalog } from 'typesxml';

const parser = new SAXParser();
const builder = new DOMBuilder();
const dtdParser = new DTDParser();

// Optional: Set up catalog for DTD resolution
const catalog = new Catalog('/path/to/catalog.xml');
builder.setCatalog(catalog);
dtdParser.setCatalog(catalog);

// Create DTD grammar
const dtdGrammar = dtdParser.parseDTD('schema.dtd');

// Configure parser with grammar
parser.setGrammar(dtdGrammar);
parser.setValidating(true);  // Strict DTD validation - rejects invalid documents
parser.setIncludeDefaultAttributes(true); // Include default attributes
parser.setContentHandler(builder);
```

### Flexible Validation Modes

```typescript
// Strict validation mode
parser.setGrammar(dtdGrammar);
parser.setValidating(true);

// Helpful mode: DTD parsing + default attributes without strict validation
parser.setGrammar(dtdGrammar);
parser.setValidating(false);

// No validation mode
const noOpGrammar = new NoOpGrammar();
parser.setGrammar(noOpGrammar);
parser.setValidating(false);
```

### Default Attributes Example

```typescript
// DTD declares: <!ATTLIST concept class CDATA "- topic/topic concept/concept ">
// Input XML: <concept id="example">
// Result:    <concept id="example" class="- topic/topic concept/concept ">

const ditaXml = `<?xml version="1.0"?>
<!DOCTYPE concept PUBLIC "-//OASIS//DTD DITA Concept//EN" "concept.dtd">
<concept id="example">
    <title>Example Topic</title>
</concept>`;

parser.parseString(ditaXml);
const doc = builder.getDocument();
const root = doc?.getRoot();

// Default @class attribute is automatically set
console.log(root?.getAttribute('class')?.getValue()); 
// Output: "- topic/topic concept/concept "
```

### Validation Error Handling

```typescript
try {
    parser.setValidating(true);
    parser.parseString(xmlWithErrors);
} catch (error) {
    if (error.message.includes('validation')) {
        console.error('DTD validation failed:', error.message);
    } else {
        console.error('Parse error:', error.message);
    }
}
```

### DTD Validation Example

```typescript
// Example: Invalid document that fails DTD validation
const invalidXml = `<?xml version="1.0"?>
<!DOCTYPE book [
  <!ELEMENT book (title, author+, chapter*)>
  <!ELEMENT title (#PCDATA)>
  <!ELEMENT author (#PCDATA)>
]>
<book>
  <title>Book Title</title>
  <!-- Missing required author+ elements -->
</book>`;

const parser = new SAXParser();
const builder = new DOMBuilder();
const dtdParser = new DTDParser();

// Parse internal DTD
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
parser.setValidating(true);
parser.setContentHandler(builder);

try {
    parser.parseString(invalidXml);
    console.log('Document is valid');
} catch (error) {
    console.error('Validation error:', error.message);
    // Output: "Content model validation failed for element 'book': Required content particle '(title,author+,chapter*)' not satisfied"
}
```

### DITA Processing Ready

```typescript
// All DITA elements automatically get proper @class attributes
const elements = doc?.getElementsByTagName('*');
elements?.forEach(element => {
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

## DTD Grammar Features

### Parsing DTD and Creating Grammar

```typescript
import { DTDParser, DTDGrammar } from 'typesxml';

// Parse DTD file
const dtdParser = new DTDParser();
const dtdGrammar = dtdParser.parseDTD('schema.dtd');

// Parse internal subset
const internalDTD = `<!ELEMENT book (title, author+)>`;
const internalGrammar = dtdParser.parseInternalSubset(internalDTD);

// Access parsed components through DTDGrammar methods
const elements = dtdGrammar.getElementDeclMap();
const attributes = dtdGrammar.getAttributesMap();
const entities = dtdGrammar.getEntitiesMap();
const notations = dtdGrammar.getNotationsMap();
```

### Working with Content Models

```typescript
import { QualifiedName } from 'typesxml';

// Get content model for an element using Grammar interface
const bookName = new QualifiedName('book');
const bookModel = dtdGrammar.getElementContentModel(bookName);
if (bookModel) {
    console.log('Type:', bookModel.getType()); // 'Children', 'Mixed', 'EMPTY', 'ANY'
    console.log('Children:', [...bookModel.getChildren()]);
    console.log('Is mixed:', bookModel.isMixed());
}

// Parse content model from string
import { ContentModel } from 'typesxml';
const model = ContentModel.parse('(title, author+, (chapter | appendix)+)');
```

### Accessing DTD Declarations

```typescript
// Element declarations (DTD-specific access)
const bookElement = dtdGrammar.getElementDeclMap().get('book');
console.log('Content spec:', bookElement?.getContentSpec());

// Attribute declarations through Grammar interface
const bookName = new QualifiedName('book');
const bookAttrs = dtdGrammar.getElementAttributes(bookName);
bookAttrs.forEach((attrInfo, qName) => {
    console.log(`${qName.getLocalName()}: ${attrInfo.getType()}`);
    if (attrInfo.hasDefaultValue()) {
        console.log(`  Default: ${attrInfo.getDefaultValue()}`);
    }
});

// Entity declarations through Grammar interface
const copyrightValue = dtdGrammar.getEntityValue('copyright');
if (copyrightValue) {
    console.log('Copyright entity:', copyrightValue);
}

// Notation declarations through Grammar interface
const gifNotation = dtdGrammar.getNotation('gif');
if (gifNotation) {
    console.log('GIF notation:', gifNotation.getSystemId());
}
```

### DTD Content Particles

```typescript
import { DTDChoice, DTDName, DTDSecuence, DTDPCData, Cardinality } from 'typesxml';

// Create content particles
const titleParticle = new DTDName('title');
console.log(titleParticle.getName()); // 'title'

// Create choice particle (author | editor)+
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
```

## Best Practices

1. **Always check for null/undefined**:

   ```typescript
   const doc = builder.getDocument();
   if (doc) {
       const root = doc.getRoot();
       if (root) {
           // Safe to use root
       }
   }
   ```

2. **Use try-catch for parsing**:

   ```typescript
   try {
       parser.parseFile('file.xml');
   } catch (error) {
       console.error('Parse failed:', error.message);
   }
   ```

3. **Choose appropriate grammar for your use case**:

   ```typescript
   // For strict validation
   parser.setGrammar(dtdGrammar);
   parser.setValidating(true);
   
   // For default attributes without strict validation
   parser.setGrammar(dtdGrammar);
   parser.setValidating(false);
   
   // For simple parsing without schema
   parser.setGrammar(new NoOpGrammar());
   parser.setValidating(false);
   ```

4. **Prefer DOMBuilder for most use cases**:
   - Use DOMBuilder when you need to manipulate the XML
   - Use custom ContentHandler only for streaming/large files

5. **Use XMLWriter for output**:

   ```typescript
   // Preferred
   XMLWriter.writeDocument(doc, 'output.xml');
   
   // Instead of
   fs.writeFileSync('output.xml', doc.toString());
   ```

6. **Handle encodings explicitly**:

   ```typescript
   parser.parseFile('file.xml', 'utf8');
   ```

7. **Use QualifiedName for namespace-aware processing**:

   ```typescript
   // When working with namespaces
   const qName = new QualifiedName('element', 'http://example.com/ns');
   const attributes = grammar.getElementAttributes(qName);
   ```

8. **Configure default attributes appropriately**:

   ```typescript
   // Enable default attributes (recommended for DITA/DocBook)
   parser.setIncludeDefaultAttributes(true);
   
   // Disable for minimal output
   parser.setIncludeDefaultAttributes(false);
   ```
