# TypesXML Quick Reference

## Quick Start Cheat Sheet

### 1. Basic Parsing (String)

```typescript
import { SAXParser, DOMBuilder, XMLDocument } from 'typesxml';

const parser: SAXParser = new SAXParser();
const builder: DOMBuilder = new DOMBuilder();
parser.setContentHandler(builder);
parser.parseString('<root><child>text</child></root>');
const doc: XMLDocument | undefined = builder.getDocument();
```

### 2. Basic Parsing (File)

```typescript
import { SAXParser, DOMBuilder, XMLDocument } from 'typesxml';

const parser: SAXParser = new SAXParser();
const builder: DOMBuilder = new DOMBuilder();
parser.setContentHandler(builder);
parser.parseFile('document.xml');
const doc: XMLDocument | undefined = builder.getDocument();
```

### 3. Parsing XML with DTD Declaration

```typescript
import { SAXParser, DOMBuilder, Catalog, XMLDocument } from 'typesxml';

const parser: SAXParser = new SAXParser();
const builder: DOMBuilder = new DOMBuilder();

// Optional: Set up catalog for DTD resolution
const catalog: Catalog = new Catalog('/path/to/catalog.xml');
builder.setCatalog(catalog);

// Configure parser for validation
parser.setValidating(true); // Enable DTD validation
parser.setIncludeDefaultAttributes(true); // Include default attributes
parser.setContentHandler(builder);

// Parse XML file that declares its own DTD
const xmlWithDTD: string = `<?xml version="1.0"?>
<!DOCTYPE book SYSTEM "book.dtd">
<book>
  <title>Example Book</title>
</book>`;

parser.parseString(xmlWithDTD);
const doc: XMLDocument | undefined = builder.getDocument();
```

### 4. Parsing XML with Schema Declaration

```typescript
import { SAXParser, DOMBuilder, Catalog, XMLDocument } from 'typesxml';

const parser: SAXParser = new SAXParser();
const builder: DOMBuilder = new DOMBuilder();

// Optional: Set up catalog for schema resolution
const catalog: Catalog = new Catalog('/path/to/catalog.xml');
builder.setCatalog(catalog);

// Configure parser for schema validation
parser.setValidating(true); // Enable schema validation
parser.setContentHandler(builder);

// Parse XML file that declares its own schema
const xmlWithSchema: string = `<?xml version="1.0"?>
<purchaseOrder xmlns="http://example.com/po"
               xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xsi:schemaLocation="http://example.com/po purchase-order.xsd">
  <shipTo>
    <name>Alice Smith</name>
  </shipTo>
</purchaseOrder>`;

parser.parseFile('purchase-order.xml'); // or parseString(xmlWithSchema)
const doc: XMLDocument | undefined = builder.getDocument();
```

### 5. Creating XML from Scratch

```typescript
import { XMLDocument, XMLElement, XMLAttribute, XMLDeclaration } from 'typesxml';

const doc: XMLDocument = new XMLDocument();
doc.setXmlDeclaration(new XMLDeclaration('1.0', 'UTF-8'));

const root: XMLElement = new XMLElement('catalog');
root.setAttribute(new XMLAttribute('version', '1.0'));

const item: XMLElement = new XMLElement('item');
item.setAttribute(new XMLAttribute('id', '123'));
item.addString('Item Text');
root.addElement(item);

doc.setRoot(root);
console.log(doc.toString());
```

### 6. Writing to File

```typescript
import { XMLWriter, XMLDocument, XMLElement } from 'typesxml';

// Write complete document
XMLWriter.writeDocument(document, 'output.xml');

// Or incremental writing
const writer: XMLWriter = new XMLWriter('output.xml');
writer.writeNode(element);
writer.writeString('\n');
```

## Grammar Framework

### Automatic Grammar Detection

```typescript
import { SAXParser, DOMBuilder, Catalog } from 'typesxml';

const parser: SAXParser = new SAXParser();
const builder: DOMBuilder = new DOMBuilder();

// Set up catalog for DTD/schema resolution
const catalog: Catalog = new Catalog('/path/to/catalog.xml');
builder.setCatalog(catalog);

// Configure validation - grammar is automatically detected from XML
parser.setValidating(true); // Enable validation
parser.setIncludeDefaultAttributes(true); // Include DTD default attributes
parser.setContentHandler(builder);

// The parser automatically detects and uses:
// - DTD from <!DOCTYPE> declarations
// - XML Schema from xsi:schemaLocation
// - No validation for XML without grammar declarations
parser.parseFile('any-xml-file.xml');
```

### Common XML File Types

```typescript
// DITA files with PUBLIC DTD references
const ditaXml: string = `<?xml version="1.0"?>
<!DOCTYPE concept PUBLIC "-//OASIS//DTD DITA Concept//EN" "concept.dtd">
<concept id="example">
  <title>Example Topic</title>
</concept>`;

// DocBook files with SYSTEM DTD references  
const docbookXml: string = `<?xml version="1.0"?>
<!DOCTYPE book SYSTEM "docbook.dtd">
<book>
  <title>Example Book</title>
</book>`;

// XML Schema instance documents
const schemaXml: string = `<?xml version="1.0"?>
<catalog xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:noNamespaceSchemaLocation="catalog.xsd">
  <item id="123">Item</item>
</catalog>`;

// All parse automatically with appropriate validation
parser.parseString(ditaXml);    // Uses DTD validation + default attributes
parser.parseString(docbookXml); // Uses DTD validation  
parser.parseString(schemaXml);  // Uses XML Schema validation
```

### Validation Context and Results

```typescript
import { ValidationContext, ValidationResult, ValidationError, Grammar } from 'typesxml';

// Validation results are typically handled automatically by the parser
// But you can access validation context for custom validation scenarios
const context: ValidationContext = new ValidationContext();

// Example: Check if validation errors occurred during parsing
try {
    parser.setValidating(true);
    parser.parseFile('document.xml');
    console.log('Document is valid');
} catch (error: unknown) {
    if (error instanceof Error) {
        console.log(`Validation error: ${error.message}`);
    }
}
```

### Grammar Types

```typescript
import { GrammarType, Grammar } from 'typesxml';

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

## XML Schema Support (Enhanced October 2025)

### Parsing Schema-Declared XML

```typescript
import { SAXParser, DOMBuilder, XMLDocument } from 'typesxml';

const parser: SAXParser = new SAXParser();
const builder: DOMBuilder = new DOMBuilder();

// Configure parser for schema validation
parser.setValidating(true); // Enable validation
parser.setContentHandler(builder);

// Parse XML that declares its schema location
const xmlFile: string = 'purchase-order.xml'; // Contains xsi:schemaLocation
parser.parseFile(xmlFile);
const doc: XMLDocument | undefined = builder.getDocument(); // Fully validated document
```

### Real-World Schema Examples

```typescript
// XML with namespace and schema location
const purchaseOrder: string = `<?xml version="1.0"?>
<apo:purchaseOrder xmlns:apo="http://example.com/po"
                   xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                   xsi:schemaLocation="http://example.com/po purchase-order.xsd">
  <apo:shipTo country="US">
    <apo:name>Alice Smith</apo:name>
    <apo:street>123 Maple Street</apo:street>
  </apo:shipTo>
</apo:purchaseOrder>`;

// XML with no-namespace schema
const catalog: string = `<?xml version="1.0"?>
<catalog xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:noNamespaceSchemaLocation="catalog.xsd">
  <item id="123">
    <name>Product Name</name>
    <price>29.99</price>
  </item>
</catalog>`;

// Both validate automatically when parsing
parser.parseString(purchaseOrder); // Uses purchase-order.xsd
parser.parseString(catalog);        // Uses catalog.xsd
```

### Schema Validation Features

- **Complex Types**: Full support for complex type definitions with inheritance and extensions
- **Sequences & Choices**: Complete validation of sequence and choice particles
- **Namespace Awareness**: Proper handling of qualified names and namespace URIs
- **Cardinality Constraints**: Validation of minOccurs/maxOccurs constraints
- **Type Inheritance**: Support for complex type extensions and restrictions
- **Error Reporting**: Detailed validation messages with context information

### W3C Compliance

Current XML Schema implementation achieves **76% success rate** on the W3C XML Schema test suite (49,072/64,543 files), covering:

- Element and attribute declarations
- Complex and simple type definitions
- Namespace processing
- Content model validation
- Type substitution and inheritance

## Common Operations

### Working with Elements

```typescript
import { XMLElement, XMLAttribute } from 'typesxml';

// Create element
const element: XMLElement = new XMLElement('book');

// Add attributes
element.setAttribute(new XMLAttribute('id', '123'));
element.setAttribute(new XMLAttribute('lang', 'en'));

// Add text content
element.addString('Book Title');

// Add child elements
const author: XMLElement = new XMLElement('author');
author.addString('John Doe');
element.addElement(author);

// Get children
const children: XMLElement[] = element.getChildren();
const firstChild: XMLElement | undefined = element.getChild('author');

// Get attributes
const id: string | undefined = element.getAttribute('id')?.getValue();
const allAttributes: XMLAttribute[] = element.getAttributes();

// Get text content (recursive)
const textContent: string = element.getText();
```

### Working with Documents

```typescript
import { XMLDocument, XMLElement, XMLDeclaration, XMLDocumentType, XMLComment, ProcessingInstruction } from 'typesxml';

// Access document parts
const root: XMLElement | undefined = document.getRoot();
const declaration: XMLDeclaration | undefined = document.getXmlDeclaration();
const docType: XMLDocumentType | undefined = document.getDocumentType();

// Add document-level content
document.addComment(new XMLComment('This is a comment'));
document.addProcessingInstruction(new ProcessingInstruction('target', 'data'));
```

### Navigation and Searching

```typescript
import { XMLDocument, XMLElement } from 'typesxml';

// Find elements by name
const root: XMLElement | undefined = document.getRoot();
const children: XMLElement[] | undefined = root?.getChildren();
const specificChild: XMLElement | undefined = root?.getChild('targetElement');

// Remove elements
root?.removeChild(specificChild);

// Check for attributes
if (element.hasAttribute('id')) {
    const id: string | undefined = element.getAttribute('id')?.getValue();
}
```

## Error Handling Patterns

```typescript
import { SAXParser, DOMBuilder, XMLDocument } from 'typesxml';

try {
    const parser: SAXParser = new SAXParser();
    const builder: DOMBuilder = new DOMBuilder();
    parser.setContentHandler(builder);
    parser.parseFile('document.xml');
    const doc: XMLDocument | undefined = builder.getDocument();
    if (!doc) {
        throw new Error('Failed to build document');
    }
    // Process document...
} catch (error: unknown) {
    if (error instanceof Error) {
        console.error('Parse error:', error.message);
    }
}
```

## Common Use Cases

### 1. Configuration File Processing

```typescript
import { SAXParser, DOMBuilder, XMLDocument, XMLElement, XMLAttribute, XMLWriter } from 'typesxml';

function updateConfig(file: string, key: string, value: string): void {
    const parser: SAXParser = new SAXParser();
    const builder: DOMBuilder = new DOMBuilder();
    parser.setContentHandler(builder);
    parser.parseFile(file);
    
    const doc: XMLDocument | undefined = builder.getDocument();
    const root: XMLElement | undefined = doc?.getRoot();
    
    // Find or create setting
    let setting: XMLElement | undefined = root?.getChild('setting');
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
import { SAXParser, DOMBuilder, XMLDocument, XMLElement, XMLAttribute, XMLWriter } from 'typesxml';

function transformXML(inputFile: string, outputFile: string): void {
    const parser: SAXParser = new SAXParser();
    const builder: DOMBuilder = new DOMBuilder();
    parser.setContentHandler(builder);
    parser.parseFile(inputFile);
    
    const doc: XMLDocument | undefined = builder.getDocument();
    const root: XMLElement | undefined = doc?.getRoot();
    
    // Transform data
    root?.getChildren().forEach((child: XMLElement) => {
        if (child.getName() === 'oldElement') {
            child.setAttribute(new XMLAttribute('transformed', 'true'));
        }
    });
    
    XMLWriter.writeDocument(doc!, outputFile);
}
```

### 3. XML Validation/Inspection

```typescript
import { SAXParser, DOMBuilder, XMLDocument, XMLElement } from 'typesxml';

function validateStructure(xmlString: string): boolean {
    try {
        const parser: SAXParser = new SAXParser();
        const builder: DOMBuilder = new DOMBuilder();
        parser.setContentHandler(builder);
        parser.parseString(xmlString);
        
        const doc: XMLDocument | undefined = builder.getDocument();
        const root: XMLElement | undefined = doc?.getRoot();
        
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
import { Constants, XMLNode } from 'typesxml';

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
const userInput: string = "user input";
const cleaned: string = XMLUtils.cleanString(userInput);

// Check whitespace
const char: string = " ";
if (XMLUtils.isXmlSpace(char)) {
    // Handle whitespace
}

// Validate characters
const text: string = "text to validate";
const validText: boolean = XMLUtils.validXml10Chars(text);
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
import { DTDGrammar } from 'typesxml';

// Content models are automatically processed during validation
// You can inspect them if needed for advanced use cases
const elementName: string = 'book';
// DTD content model inspection is handled internally by the grammar system
```

### Accessing DTD Declarations

```typescript
import { DTDGrammar } from 'typesxml';

// DTD declarations are automatically processed during parsing
// Access is typically not needed for normal XML processing workflows

// Example: DTD processing happens automatically when parsing
const parser: SAXParser = new SAXParser();
parser.setValidating(true); // Enables DTD processing
parser.setIncludeDefaultAttributes(true); // Includes DTD default attributes
parser.parseFile('document-with-dtd.xml');

// All DTD benefits (validation, default attributes, entities) are applied automatically
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

3. **Choose appropriate validation for your XML**:

   ```typescript
   // For XML with DTD declarations (DITA, DocBook, etc.)
   parser.setValidating(true);
   parser.setIncludeDefaultAttributes(true); // Get DTD default attributes
   
   // For XML with schema declarations
   parser.setValidating(true); // Automatic schema detection
   
   // For simple XML without schemas
   parser.setValidating(false); // Skip validation
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

7. **Set up catalogs for DTD/schema resolution**:

   ```typescript
   // Required for PUBLIC DTD identifiers and schema locations
   const catalog = new Catalog('/path/to/catalog.xml');
   builder.setCatalog(catalog);
   
   // Resolves: "-//OASIS//DTD DITA Concept//EN" -> actual file path
   ```

8. **Configure default attributes appropriately**:

   ```typescript
   // Enable default attributes (recommended for DITA/DocBook)
   parser.setIncludeDefaultAttributes(true);
   
   // Disable for minimal output
   parser.setIncludeDefaultAttributes(false);
   ```

9. **Automatic validation works best**:

   ```typescript
   // Let the parser detect validation type from the XML
   parser.setValidating(true); // Handles DTD, Schema, or none automatically
   
   // XML declares its own grammar:
   // <!DOCTYPE...> -> DTD validation
   // xsi:schemaLocation -> Schema validation  
   // No declaration -> No validation
   ```
