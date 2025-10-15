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

### 3. Creating XML from Scratch

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

### 4. Writing to File

```typescript
import { XMLWriter } from 'typesxml';

// Write complete document
XMLWriter.writeDocument(document, 'output.xml');

// Or incremental writing
const writer = new XMLWriter('output.xml');
writer.writeNode(element);
writer.writeString('\n');
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

## DTD Validation and Default Attributes

### Basic Setup with DTD Support

```typescript
import { SAXParser, DOMBuilder, Catalog } from 'typesxml';

const parser = new SAXParser();
const builder = new DOMBuilder();

// Optional: Set up catalog for DTD resolution
const catalog = new Catalog('/path/to/catalog.xml');
builder.setCatalog(catalog);

// Choose validation mode
parser.setValidating(true);  // Strict DTD validation - rejects invalid documents
// OR
parser.setValidating(false); // Helpful mode: DTD parsing + default attributes without strict validation

parser.setContentHandler(builder);
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
parser.setValidating(true); // Enable strict validation
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

## DTD and Grammar Support

### Parsing DTD and Creating Grammar

```typescript
import { DTDParser } from 'typesxml';

// Parse DTD file
const dtdParser = new DTDParser();
const grammar = dtdParser.parseDTD('schema.dtd');

// Access parsed components
const elements = grammar.getElementDeclMap();
const attributes = grammar.getAttributesMap();
const entities = grammar.getEntitiesMap();
```

### Working with Content Models

```typescript
// Get content model for an element
const bookModel = grammar.getContentModel('book');
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
// Element declarations
const bookElement = grammar.getElementDeclMap().get('book');
console.log('Content spec:', bookElement?.getContentSpec());

// Attribute declarations
const bookAttrs = grammar.getElementAttributesMap('book');
bookAttrs?.forEach((attr, name) => {
    console.log(`${name}: ${attr.getType()} = ${attr.getDefaultValue()}`);
});

// Entity declarations
const entities = grammar.getEntitiesMap();
const copyright = entities.get('copyright');
console.log('Entity value:', copyright?.getValue());

// Notation declarations
const notations = grammar.getNotationsMap();
notations.forEach((notation, name) => {
    console.log(`${name}: ${notation.getSystemId()}`);
});
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

3. **Prefer DOMBuilder for most use cases**:
   - Use DOMBuilder when you need to manipulate the XML
   - Use custom ContentHandler only for streaming/large files

4. **Use XMLWriter for output**:

   ```typescript
   // Preferred
   XMLWriter.writeDocument(doc, 'output.xml');
   
   // Instead of
   fs.writeFileSync('output.xml', doc.toString());
   ```

5. **Handle encodings explicitly**:

   ```typescript
   parser.parseFile('file.xml', 'utf8');
   ```
