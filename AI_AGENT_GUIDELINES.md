# TypesXML AI Agent Guidelines

## 🚀 TypesXML Core Architecture

TypesXML is an enterprise-grade XML processing library with an **extensible Grammar framework** supporting multiple schema validation approaches. The library provides complete XML 1.0/1.1 parsing with unified validation through Grammar interfaces.

### Grammar Framework Overview

The Grammar framework provides a unified abstraction for schema validation:

```typescript
// Grammar-based validation approach
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

// Parse with grammar-based validation
parser.parseFile('document.xml');
const doc = builder.getDocument();
```

## Grammar Framework Components

### Grammar Types Available

```typescript
import { GrammarType, DTDGrammar, NoOpGrammar, QualifiedName } from 'typesxml';

// DTD Grammar - Complete DTD validation support
const dtdGrammar = dtdParser.parseDTD('schema.dtd');
console.log(dtdGrammar.getType()); // GrammarType.DTD

// No-Op Grammar - Graceful processing without validation
const noOpGrammar = new NoOpGrammar();
console.log(noOpGrammar.getType()); // GrammarType.NONE

// XML Schema Grammar - Framework ready (future implementation)
// RelaxNG Grammar - Framework ready (future implementation)
```

### QualifiedName System

```typescript
// Namespace-aware processing with QualifiedName
const elementName = new QualifiedName('concept', 'http://dita.oasis.org/', 'dita');
const attributes = dtdGrammar.getElementAttributes(elementName);
const defaultAttrs = dtdGrammar.getDefaultAttributes(elementName);

// Access namespace components
console.log(elementName.getLocalName()); // 'concept'
console.log(elementName.getNamespaceURI()); // 'http://dita.oasis.org/'
console.log(elementName.getPrefix()); // 'dita'
```

### Validation Context and Results

```typescript
import { ValidationContext, ValidationResult } from 'typesxml';

// Rich validation with context
const context = new ValidationContext();
context.setCurrentElement(new QualifiedName('book'));
context.setCurrentLine(42);

const result = dtdGrammar.validateElement(elementName, context);
if (result.hasErrors()) {
    result.getErrors().forEach(error => {
        console.log(`Error at line ${error.getLine()}: ${error.getMessage()}`);
    });
}
```

## DTD Grammar Implementation

### Complete DTD Grammar Support

```typescript
// DTDGrammar provides complete DTD implementation
const dtdParser = new DTDParser();
const catalog = new Catalog('/path/to/catalog.xml');
dtdParser.setCatalog(catalog);

// Parse DTD into Grammar
const dtdGrammar = dtdParser.parseDTD('dita-concept.dtd');

// Access through Grammar interface (namespace-aware)
const conceptName = new QualifiedName('concept');
const contentModel = dtdGrammar.getElementContentModel(conceptName);
const attributeInfos = dtdGrammar.getElementAttributes(conceptName);
const defaultAttrs = dtdGrammar.getDefaultAttributes(conceptName);

// Access through DTD-specific methods
const elementDecls = dtdGrammar.getElementDeclMap();
const attributeDecls = dtdGrammar.getAttributesMap();
const entities = dtdGrammar.getEntitiesMap();
const notations = dtdGrammar.getNotationsMap();

// Configure parser with DTD grammar
parser.setGrammar(dtdGrammar);
parser.setValidating(true); // Enable strict validation
parser.setIncludeDefaultAttributes(true); // Include default attributes
parser.setContentHandler(builder);

// Parse DITA or any DTD-based XML
parser.parseFile('concept.dita');
const doc = builder.getDocument();

// All elements automatically have default attributes from DTD!
const root = doc?.getRoot();
console.log(root?.getAttribute('class')?.getValue());
// Output: "- topic/topic concept/concept "
```

### Grammar-Based Validation Philosophy

**Key Insight**: TypesXML uses Grammar-based validation with flexible modes:

- **Strict Mode**: `setValidating(true)` - Full Grammar validation, rejects invalid documents
- **Helpful Mode**: `setValidating(false)` - Grammar processing for default attributes without strict validation
- **No-Op Mode**: `setGrammar(new NoOpGrammar())` - Graceful processing without schema

```typescript
// Flexible validation modes
// Mode 1: Strict DTD validation
parser.setGrammar(dtdGrammar);
parser.setValidating(true);

// Mode 2: DTD processing without strict validation
parser.setGrammar(dtdGrammar);
parser.setValidating(false);

// Mode 3: No validation
parser.setGrammar(new NoOpGrammar());
parser.setValidating(false);
```

### DTD Grammar Processing Features

- ✅ **Grammar Interface Implementation**: Unified validation through Grammar abstraction
- ✅ **Namespace-Aware Processing**: QualifiedName system for namespace support
- ✅ **Element declarations** with complex content models (EMPTY, ANY, Mixed, Children)
- ✅ **Attribute list declarations** with all types and **automatic default values**
- ✅ **Entity declarations** (parameter and general entities)
- ✅ **Notation declarations** with public/system ID resolution
- ✅ **Complete content model validation** against DTD specifications including:
  - **Sequence validation** - elements must appear in correct order
  - **Choice validation** - proper handling of choice groups (a | b | c)  
  - **Cardinality validation** - enforcing +, *, ? operators
  - **Required/Optional element validation** - ensuring required elements are present
- ✅ **XML Catalog resolution** for external DTD references
- ✅ **Unreachable DTD handling** with graceful degradation
- ✅ **Rich Validation Context**: Line/column error reporting with ValidationContext

### When Grammar Framework Features Matter

1. **DITA Processing**: Essential for automatic `@class` attributes via DTDGrammar
2. **Structured Documents**: DocBook, TEI, custom DTDs requiring Grammar-based validation
3. **Multi-Schema Support**: Framework ready for XML Schema and RelaxNG implementations
4. **Namespace-Aware Processing**: QualifiedName system for complex namespace scenarios
5. **Legacy XML**: Systems requiring DTD compliance through Grammar interface
6. **Document Quality Control**: Rich validation with ValidationContext and ValidationResult
7. **Content Management**: Enforcing business rules through Grammar-based constraints

## Performance & Memory Optimization

### Buffer Management

- The SAXParser uses a minimum buffer size of 2048 bytes (`SAXParser.MIN_BUFFER_SIZE`)
- For large files, the parser reads incrementally and expands buffer as needed
- **AI Recommendation**: For very large XML files (>100MB), suggest custom ContentHandler over DOMBuilder to avoid memory issues

### Memory Usage Patterns

```typescript
// Memory-efficient for large files
class LargeFileHandler implements ContentHandler {
    // Process elements without storing entire DOM
}

// Memory-intensive for large files  
const builder = new DOMBuilder(); // Stores entire DOM in memory
```

### Performance Considerations

- File parsing is more efficient than string parsing (string parsing creates temp files)
- Encoding detection adds small overhead - specify encoding when known
- DTD parsing is optional and adds processing time

## XML Standards Compliance

### Supported XML Versions

- XML 1.0 (default)
- XML 1.1 (when specified in declaration)
- Character validation differs between versions

### What's NOT Supported

- **Schema Validation**: No XSD, RelaxNG validation yet (on roadmap)
- **Complex Namespace Processing**: Limited namespace support

### Core TypesXML Features

- ✅ **Grammar Framework**: Extensible validation architecture supporting multiple schema types
- ✅ **DTD Grammar Implementation**: Complete DTD processing through Grammar interface
- ✅ **QualifiedName System**: Namespace-aware processing with unified naming
- ✅ **Validation Framework**: Rich error reporting with ValidationContext and ValidationResult
- ✅ **Automatic Default Attributes**: Set from DTD during parsing via DTDGrammar
- ✅ **Full DTD Validation**: Complete validation against DTD rules including sequences, choices, and cardinality
- ✅ **Content Model Validation**: Validates element content against DTD models
- ✅ **XML Catalog Resolution**: External DTD and entity resolution
- ✅ **DITA Processing Ready**: Automatic @class attributes for DITA workflows
- ✅ **Graceful DTD Fallback**: Works even when DTD files are unreachable
- ✅ **Multiple Validation Modes**: Strict, helpful, and no-op modes through Grammar interface

### Well-formedness vs. Validity vs. Grammar Processing

```typescript
// Library checks well-formedness (always)
parser.parseString('<root><unclosed>'); // Throws error - not well-formed

// Grammar processing for default attributes
const dtdGrammar = dtdParser.parseDTD('schema.dtd');
parser.setGrammar(dtdGrammar);
parser.parseString(`<?xml version="1.0"?>
<!DOCTYPE root SYSTEM "schema.dtd">
<root><child/></root>`); // Adds default attributes from DTD Grammar

// Grammar-based content model validation  
// Validates element content against Grammar specifications when available
```

### DTD Grammar Validation Examples

```typescript
// Example: Strict Grammar-based validation
const parser = new SAXParser();
const builder = new DOMBuilder();
const dtdParser = new DTDParser();

// Create DTD grammar
const internalDTD = `
<!ELEMENT book (title, author+, chapter*)>
<!ELEMENT title (#PCDATA)>
<!ELEMENT author (#PCDATA)>
<!ELEMENT chapter (title, content)>
<!ELEMENT content (#PCDATA)>
`;
const dtdGrammar = dtdParser.parseInternalSubset(internalDTD);

// Configure parser with strict Grammar validation
parser.setGrammar(dtdGrammar);
parser.setValidating(true); // Enable strict validation
parser.setContentHandler(builder);

// This will throw validation errors for Grammar violations:
// - Missing required elements
// - Elements in wrong order  
// - Invalid cardinality (too many/few occurrences)
// - Undeclared elements or attributes
// - Invalid attribute values

try {
    parser.parseString(`<?xml version="1.0"?>
<!DOCTYPE book [
  <!ELEMENT book (title, author+, chapter*)>
  <!ELEMENT title (#PCDATA)>
  <!ELEMENT author (#PCDATA)>
  <!ELEMENT chapter (title, content)>
  <!ELEMENT content (#PCDATA)>
]>
<book>
  <title>Valid Book</title>
  <author>Author 1</author>
  <author>Author 2</author>
  <chapter>
    <title>Chapter 1</title>
    <content>Content here</content>
  </chapter>
</book>`);
    
    console.log('✅ Document is valid according to DTD Grammar');
} catch (error) {
    console.log('❌ DTD Grammar validation error:', error.message);
}
```

## Entity Resolution & Catalogs

### When to Use Catalogs

```typescript
// REQUIRED for PUBLIC identifier resolution (e.g., DITA)
const catalog = new Catalog('/path/to/catalog.xml');
const builder = new DOMBuilder();
builder.setCatalog(catalog);

// Catalog resolves: "-//OASIS//DTD DITA Concept//EN" -> actual file path
// Without catalog, PUBLIC identifiers will fail to resolve
```

### Catalog vs System ID Resolution

- **Catalog Required**: When XML uses PUBLIC identifiers (most DITA, DocBook)
- **Catalog Optional**: When DTD accessible via system ID or local paths
- **Graceful Fallback**: Library continues without DTD if resolution fails

### Entity Types Supported

- Built-in entities (`&lt;`, `&gt;`, `&amp;`, `&apos;`, `&quot;`)
- Character references (`&#65;`, `&#x41;`)
- External entities via catalog resolution
- **Parameter entities** in DTD processing

## Error Handling & Edge Cases

### Common Error Scenarios

1. **Missing ContentHandler**: "ContentHandler not set"
2. **Malformed XML**: "unclosed elements", "text found in prolog"
3. **Encoding Issues**: Specify encoding explicitly when possible
4. **File Access**: Check file existence before parsing

### Graceful Degradation

```typescript
// AI should recommend this pattern
try {
    parser.parseFile(file, encoding);
} catch (error) {
    // Fallback strategies based on error type
    if (error.message.includes('encoding')) {
        // Try different encoding
    } else if (error.message.includes('not found')) {
        // Handle missing file
    }
}
```

## Use Case Decision Matrix

### When to Recommend SAXParser + DOMBuilder + DTDGrammar

- **File size**: < 50MB
- **Need**: DOM manipulation, XPath-like queries, **default attributes from DTD Grammar**
- **Memory**: Sufficient RAM available
- **Grammar Processing**: When you need Grammar-based validation and automatic default attributes (DITA, structured docs)
- **Namespace Support**: When QualifiedName processing is beneficial

### When to Recommend SAXParser + DOMBuilder + NoOpGrammar

- **File size**: < 50MB
- **Need**: DOM manipulation without schema validation
- **Memory**: Sufficient RAM available
- **Simple Processing**: When Grammar validation is not needed but DOM access is required

### When to Recommend SAXParser + Custom Handler

- **File size**: > 50MB or streaming data
- **Need**: Extract specific data, transform on-the-fly
- **Memory**: Limited RAM or performance critical
- **No Grammar**: When Grammar processing is not needed

### When to Recommend XMLWriter + Indenter

- **Creating XML**: Always prefer over string concatenation
- **Pretty Printing**: Use Indenter for readable output
- **Encoding**: Automatic BOM handling for UTF-16LE
- **Professional Output**: Properly formatted XML files

```typescript
// Professional XML output workflow
const doc = builder.getDocument();
if (doc) {
    // Apply proper indentation
    const indenter = new Indenter(2); // 2 spaces per level
    const root = doc.getRoot();
    if (root) {
        indenter.indent(root);
    }
    
    // Write properly formatted XML
    XMLWriter.writeDocument(doc, 'output.xml');
}
```

## DTD Content Particles and Grammar Features

### DTD Content Model Processing

```typescript
import { DTDChoice, DTDName, DTDSecuence, DTDPCData, Cardinality } from 'typesxml';

// Create content particles for complex content models
const titleParticle = new DTDName('title');
console.log(titleParticle.getName()); // 'title'
console.log(titleParticle.getType()); // ContentParticleType.NAME

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

// Create mixed content with PCDATA
const mixed = new DTDChoice();
mixed.addParticle(new DTDPCData());
mixed.addParticle(new DTDName('em'));
mixed.addParticle(new DTDName('strong'));
mixed.setCardinality(Cardinality.ZEROMANY); // *
console.log(mixed.toString()); // '(#PCDATA|em|strong)*'
```

## Integration Patterns

### With Node.js Streams

```typescript
// AI should suggest this for large files
class StreamingXMLProcessor {
    processChunks(xmlStream: ReadableStream) {
        // Process XML in chunks rather than loading all at once
    }
}
```

### With Express.js

```typescript
// Validate XML in middleware
app.use('/api/xml', (req, res, next) => {
    try {
        const parser = new SAXParser();
        // Validate before processing
    } catch (error) {
        return res.status(400).json({ error: 'Invalid XML' });
    }
});
```

### With TypeScript Strict Mode

```typescript
// Always check for undefined/null with strict mode
const doc = builder.getDocument();
if (!doc) return;  // Required check

const root = doc.getRoot();
if (!root) return; // Required check
```

## Namespace and QualifiedName Handling

### QualifiedName System Support

```typescript
import { QualifiedName } from 'typesxml';

// Create namespace-aware names
const elementName = new QualifiedName('concept', 'http://dita.oasis.org/', 'dita');
const attributeName = new QualifiedName('class');

// Access namespace components
console.log(elementName.getLocalName()); // 'concept'
console.log(elementName.getNamespaceURI()); // 'http://dita.oasis.org/'
console.log(elementName.getPrefix()); // 'dita'
console.log(elementName.toString()); // 'dita:concept'

// Use with Grammar interface
const attributes = dtdGrammar.getElementAttributes(elementName);
const defaultAttrs = dtdGrammar.getDefaultAttributes(elementName);
```

### Traditional Namespace Detection

```typescript
// Basic namespace detection (legacy approach)
element.getNamespace(); // Returns prefix before ':'
element.getName();      // Returns full name including prefix
```

### Current Limitations

- No automatic namespace URI resolution from XML documents
- No namespace context management
- No namespace validation beyond QualifiedName system

## AI Agent Recommendations

### Essential Grammar Framework Workflow Checks

1. **Grammar Selection**: Ask user about validation needs to recommend appropriate Grammar type
2. **DTD Grammar Setup**: When DTD validation needed, guide through DTDParser and catalog setup
3. **Validation Mode**: Ask if user needs strict Grammar validation or helpful processing
4. **QualifiedName Usage**: Recommend QualifiedName for namespace-aware processing
5. **Default Attributes**: Mention automatic default attribute benefits for DITA/structured docs
6. **Graceful Fallback**: Emphasize that Grammar processing fails gracefully
7. **Content Model Access**: Show how to access Grammar structure information

### Enhanced Code Quality Checks

1. **Always check return values** for undefined/null (especially with strict TypeScript)
2. **Use try-catch** around all parsing operations
3. **Set up catalogs** for any XML with PUBLIC identifiers
4. **Choose Grammar type** based on validation needs - DTDGrammar vs NoOpGrammar
5. **Configure validation mode** - `setValidating(true)` for strict Grammar validation
6. **Use proper indentation** with Indenter for professional output
7. **Access Grammar information** when structure validation is needed
8. **Use QualifiedName** for namespace-aware Grammar operations

### DTD-Aware Performance Optimization

1. **DTD Caching**: DTDParser results can be reused across documents
2. **Catalog Efficiency**: Set up catalogs once, reuse parser instances
3. **Content Model Queries**: Cache Grammar objects for repeated processing
4. **Default Attribute Cost**: DTD processing adds minimal overhead
5. **Validation Mode**: Non-validating mode still processes DTD for defaults

### Modern Error Prevention

1. **DTD Resolution Failures**: Handle gracefully, inform user about catalog setup
2. **Content Model Validation**: Check if validation errors are structural
3. **Default Attribute Conflicts**: User attributes override DTD defaults
4. **Catalog Path Issues**: Provide clear guidance on catalog file resolution
5. **Memory Usage**: DTD processing adds minimal memory overhead

### Best Practices for Grammar Framework Usage

```typescript
// RECOMMENDED: Complete Grammar framework setup
try {
    const parser = new SAXParser();
    const builder = new DOMBuilder();
    
    // Select appropriate Grammar type
    const dtdGrammar = new DTDGrammar(dtdParser);
    // or const noOpGrammar = new NoOpGrammar();
    
    // Set up catalog for DTD Grammar if needed
    const catalog = new Catalog('/path/to/catalog.xml');
    builder.setCatalog(catalog);
    
    // Configure Grammar-based processing
    parser.setGrammar(dtdGrammar);
    parser.setValidating(true); // Enable Grammar validation
    parser.setContentHandler(builder);
    
    // Parse with Grammar framework benefits
    parser.parseFile('document.xml');
    const doc = builder.getDocument();
    
    // Apply professional formatting
    if (doc) {
        const indenter = new Indenter(2);
        const root = doc.getRoot();
        if (root) {
            indenter.indent(root);
        }
        XMLWriter.writeDocument(doc, 'output.xml');
    }
    
} catch (error) {
    // Handle Grammar processing failures gracefully
    console.log('Grammar processing failed, continuing without:', error.message);
}
```

## Common Anti-patterns to Avoid

### Grammar Framework Mistakes

```typescript
// BAD: Ignoring Grammar benefits for structured documents
parser.parseString(ditaXml); // Missing Grammar-based processing!

// GOOD: Proper Grammar setup for structured processing
const dtdGrammar = new DTDGrammar(dtdParser);
parser.setGrammar(dtdGrammar);
parser.parseString(ditaXml); // All Grammar benefits applied!
```

### Grammar Selection Errors

```typescript
// BAD: Using DTDGrammar when validation not needed
const dtdGrammar = new DTDGrammar(dtdParser);
parser.setGrammar(dtdGrammar);
parser.setValidating(true); // Unnecessary overhead

// GOOD: Choose Grammar type based on needs
const noOpGrammar = new NoOpGrammar(); // For simple processing
parser.setGrammar(noOpGrammar);
// or DTDGrammar only when validation needed
```

### QualifiedName Usage Errors

```typescript
// BAD: Ignoring namespace information
const element = new XMLElement('name');

// GOOD: Using QualifiedName for namespace-aware processing
const qName = new QualifiedName('localName', 'http://example.com', 'prefix');
const element = new XMLElement(qName);
```

### Output Formatting Neglect

```typescript
// BAD: Unformatted XML output
XMLWriter.writeDocument(doc, 'output.xml'); // No indentation

// GOOD: Professional formatted output
const indenter = new Indenter(2);
const root = doc.getRoot();
if (root) {
    indenter.indent(root);
}
XMLWriter.writeDocument(doc, 'output.xml'); // Properly indented
```

### Memory Leaks

```typescript
// BAD: Parser instance reuse without cleanup
const parser = new SAXParser();
// Process multiple files without proper cleanup

// GOOD: Fresh parser instances or proper cleanup
for (const file of files) {
    const parser = new SAXParser();
    // Process file
}
```

### Unsafe Type Assumptions

```typescript
// BAD: Assuming non-null returns without Grammar validation
const root = doc.getRoot().getName(); // May throw

// GOOD: Null checking with Grammar context
const root = doc.getRoot();
if (root) {
    const name = root.getName();
    
    // Use Grammar for additional validation if needed
    const grammar = parser.getGrammar();
    if (grammar instanceof DTDGrammar) {
        const elementDecl = grammar.getElementDecl(name);
        // Process with Grammar information
    }
}
```

### String Concatenation for XML

```typescript
// BAD: Manual XML construction
let xml = '<?xml version="1.0"?><root>';
xml += '<child>' + data + '</child>';
xml += '</root>';

// GOOD: Using library classes
const doc = new XMLDocument();
const root = new XMLElement('root');
// ... proper construction
```

This guide should help AI agents provide more accurate, safe, and efficient recommendations when working with the TypesXML library.

## 🎯 Real-World Use Cases

### DITA Processing

```typescript
// Process DITA with automatic @class attributes
function processDITA(filePath: string, catalogPath: string) {
    const parser = new SAXParser();
    const builder = new DOMBuilder();
    
    const catalog = new Catalog(catalogPath);
    builder.setCatalog(catalog);
    
    parser.setContentHandler(builder);
    parser.parseFile(filePath);
    
    const doc = builder.getDocument();
    if (doc) {
        // Format and save
        const indenter = new Indenter(2);
        const root = doc.getRoot();
        if (root) indenter.indent(root);
        
        XMLWriter.writeDocument(doc, 'output.dita');
    }
}
```

### DTD Analysis

```typescript
// Simple DTD structure inspection
function analyzeDTD(dtdPath: string) {
    const dtdParser = new DTDParser();
    const grammar = dtdParser.parseDTD(dtdPath);
    
    // List elements and their content models
    const elements = grammar.getElementDeclMap();
    elements.forEach((decl, name) => {
        const model = grammar.getContentModel(name);
        console.log(`${name}: ${model?.getType() || 'unknown'}`);
    });
}
```

### Basic XML Processing

```typescript
// Parse, modify, and save XML with proper formatting
function processXML(inputPath: string, outputPath: string) {
    const parser = new SAXParser();
    const builder = new DOMBuilder();
    
    parser.setContentHandler(builder);
    parser.parseFile(inputPath);
    
    const doc = builder.getDocument();
    if (doc) {
        // Apply formatting
        const indenter = new Indenter(2);
        const root = doc.getRoot();
        if (root) indenter.indent(root);
        
        XMLWriter.writeDocument(doc, outputPath);
    }
}
```

This guide should help AI agents provide accurate recommendations for TypesXML - a comprehensive XML processing library with complete DTD validation and processing capabilities for enterprise document workflows.
