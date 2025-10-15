# TypesXML AI Agent Guidelines

## 🚀 TypesXML Capabilities

TypesXML is an enterprise-grade XML processing library with **complete DTD validation and processing** capabilities. It's particularly powerful for DITA processing, structured document workflows, and any XML processing requiring DTD compliance.

## DTD Validation & Default Attributes

### Complete DTD Support

```typescript
// Full DTD validation and default attribute processing
const parser = new SAXParser();
const builder = new DOMBuilder();

// Set up catalog for DTD resolution (required for PUBLIC identifiers)
const catalog = new Catalog('/path/to/catalog.xml');
builder.setCatalog(catalog);

// Enable validation mode (optional - defaults work in both modes)
parser.setValidating(true);
parser.setContentHandler(builder);

// Parse DITA or any DTD-based XML
parser.parseFile('concept.dita');
const doc = builder.getDocument();

// All elements automatically have default attributes from DTD!
const root = doc?.getRoot();
console.log(root?.getAttribute('class')?.getValue());
// Output: "- topic/topic concept/concept "
```

### Helpful Behavior Philosophy

**Key Insight**: TypesXML follows a "helpful behavior" approach:

- DTD parsing and default attributes work even with `setValidating(false)`
- Graceful fallback when DTD files are unreachable
- Always attempts to be helpful rather than strictly validating

### DTD Processing Features

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

### When DTD Features Matter

1. **DITA Processing**: Essential for automatic `@class` attributes
2. **Structured Documents**: DocBook, TEI, custom DTDs requiring strict validation
3. **Legacy XML**: Systems requiring DTD compliance and validation
4. **Document Quality Control**: Ensuring document structure correctness with validation
5. **Content Management**: Enforcing business rules through DTD constraints

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

- ✅ **Complete DTD Processing**: Full parsing of DTD declarations
- ✅ **Automatic Default Attributes**: Set from DTD during parsing
- ✅ **Full DTD Validation**: Complete validation against DTD rules including sequences, choices, and cardinality
- ✅ **Content Model Validation**: Validates element content against DTD models
- ✅ **XML Catalog Resolution**: External DTD and entity resolution
- ✅ **DITA Processing Ready**: Automatic @class attributes for DITA workflows
- ✅ **Graceful DTD Fallback**: Works even when DTD files are unreachable

### Well-formedness vs. Validity vs. DTD Processing

```typescript
// Library checks well-formedness (always)
parser.parseString('<root><unclosed>'); // Throws error - not well-formed

// DTD processing for default attributes
parser.parseString(`<?xml version="1.0"?>
<!DOCTYPE root SYSTEM "schema.dtd">
<root><child/></root>`); // Adds default attributes from DTD

// Content model validation  
// Validates element content against DTD content models when available
```

### DTD Validation Examples

```typescript
// Example: Strict DTD validation
const parser = new SAXParser();
const builder = new DOMBuilder();

parser.setValidating(true); // Enable strict validation
parser.setContentHandler(builder);

// This will throw validation errors for DTD violations:
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
    
    console.log('✅ Document is valid according to DTD');
} catch (error) {
    console.log('❌ DTD validation error:', error.message);
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

### When to Recommend SAXParser + DOMBuilder

- **File size**: < 50MB
- **Need**: DOM manipulation, XPath-like queries, **default attributes from DTD**
- **Memory**: Sufficient RAM available
- **DTD Processing**: When you need automatic default attributes (DITA, structured docs)

### When to Recommend SAXParser + Custom Handler

- **File size**: > 50MB or streaming data
- **Need**: Extract specific data, transform on-the-fly
- **Memory**: Limited RAM or performance critical
- **No DTD**: When DTD processing is not needed

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

## DTD and Grammar Features

### Enterprise-Grade DTD Processing

TypesXML now provides **complete DTD processing** suitable for production DITA workflows and structured document processing:

```typescript
// Complete DTD workflow example
const dtdParser = new DTDParser();
const catalog = new Catalog('/path/to/catalog.xml');
dtdParser.setCatalog(catalog);

// Parse DTD into Grammar object
const grammar = dtdParser.parseDTD('dita-schema.dtd');

// Access complete DTD information
const conceptModel = grammar.getContentModel('concept');
console.log('Content type:', conceptModel?.getType()); // "Children"
console.log('Allowed children:', [...(conceptModel?.getChildren() || [])]);

// Get attribute declarations for any element
const conceptAttrs = grammar.getElementAttributesMap('concept');
conceptAttrs?.forEach((attDecl, name) => {
    console.log(`${name}: ${attDecl.getType()} = "${attDecl.getDefaultValue()}"`);
});
```

### DTD Processing Architecture

1. **DTDParser**: Parses DTD files into Grammar objects
2. **Grammar**: Container for all DTD declarations and rules
3. **ContentModel**: Parsed representation of element content models
4. **AttDecl/ElementDecl/EntityDecl**: Individual DTD declarations
5. **DOMBuilder Integration**: Automatic default attribute application

### Content Model Processing

```typescript
// Parse complex content models
const model = ContentModel.parse('(title, (author | editor)+, (chapter | section)+)');

console.log('Model type:', model.getType()); // "Children"
console.log('Is mixed content:', model.isMixed()); // false
console.log('Child elements:', [...model.getChildren()]); // ['title', 'author', 'editor', 'chapter', 'section']

// Access content model structure
model.getContent().forEach(particle => {
    console.log('Particle type:', particle.getType());
    console.log('Cardinality:', particle.getCardinality());
    console.log('Children:', [...particle.getChildren()]);
});
```

### Default Attribute Processing

**Critical for DITA**: Default attributes are automatically applied during XML parsing:

```typescript
// Input XML (no @class attributes)
const ditaXml = `<?xml version="1.0"?>
<!DOCTYPE concept PUBLIC "-//OASIS//DTD DITA Concept//EN" "concept.dtd">
<concept id="test">
    <title>Example</title>
    <conbody>
        <p>Content</p>
    </conbody>
</concept>`;

// After parsing with DTD catalog
const doc = builder.getDocument();
const root = doc?.getRoot();

// All elements now have default @class attributes!
console.log(root?.getAttribute('class')?.getValue());
// Output: "- topic/topic concept/concept "
```

### DTD Constants and Types

```typescript
// Use proper constants for type checking
import { Cardinality, ContentModelType, ContentParticleType } from 'typesxml';

// Check cardinality
if (particle.getCardinality() === Cardinality.ONEMANY) {
    console.log('This particle uses + cardinality');
}

// Check content model type
if (model.getType() === ContentModelType.MIXED) {
    console.log('This is mixed content (#PCDATA + elements)');
}
```

### DTD Validation vs Processing

**TypesXML provides complete DTD validation**:

- ✅ **Full DTD Validation**: Runtime validation against all DTD rules including element sequences, choice groups, cardinality constraints
- ✅ **DTD Processing**: Parsing, default attributes, content model access
- ✅ **Flexible Validation**: Can enable strict validation with `setValidating(true)` or helpful processing with `setValidating(false)`

This makes TypesXML perfect for both strict document validation and "helpful" processing where you want DTD benefits (default attributes, structure info) without rejecting documents that don't strictly conform.

## Namespace Handling

### Current Support

```typescript
// Basic namespace detection
element.getNamespace(); // Returns prefix before ':'
element.getName();      // Returns full name including prefix
```

### Limitations

- No namespace URI resolution
- No namespace context management
- No namespace validation

### AI Agent Recommendations

### Essential DTD Workflow Checks

1. **Catalog Setup**: Always ask if user needs DTD processing
2. **PUBLIC vs SYSTEM**: Identify DTD reference type to recommend catalog usage
3. **Validation Mode**: Ask if user needs strict DTD validation or just helpful processing
4. **Default Attributes**: Mention automatic default attribute benefits for DITA/structured docs
5. **Graceful Fallback**: Emphasize that DTD processing fails gracefully
6. **Content Model Access**: Show how to access DTD structure information

### Enhanced Code Quality Checks

1. **Always check return values** for undefined/null (especially with strict TypeScript)
2. **Use try-catch** around all parsing operations
3. **Set up catalogs** for any XML with PUBLIC identifiers
4. **Choose validation mode** based on strictness needs - `setValidating(true)` for strict DTD validation
5. **Use proper indentation** with Indenter for professional output
6. **Access DTD information** when structure validation is needed

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

### Best Practices for DTD Processing

```typescript
// RECOMMENDED: Complete DTD processing setup
try {
    const parser = new SAXParser();
    const builder = new DOMBuilder();
    
    // Set up catalog for robust DTD resolution
    const catalog = new Catalog('/path/to/catalog.xml');
    builder.setCatalog(catalog);
    
    // Choose appropriate validation mode
    parser.setValidating(true); // Strict DTD validation mode
    parser.setContentHandler(builder);
    
    // Parse with automatic default attributes
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
    // Handle DTD resolution failures gracefully
    console.log('DTD processing failed, continuing without:', error.message);
}
```

## Common Anti-patterns to Avoid

### DTD Processing Mistakes

```typescript
// BAD: Ignoring DTD benefits for structured documents
parser.parseString(ditaXml); // Missing default @class attributes!

// GOOD: Proper DTD setup for DITA processing
const catalog = new Catalog('/path/to/dita/catalog.xml');
builder.setCatalog(catalog);
parser.parseString(ditaXml); // All default attributes applied!
```

### Catalog Resolution Errors

```typescript
// BAD: Using PUBLIC identifiers without catalog
const xmlWithPublicDTD = `<!DOCTYPE concept PUBLIC "-//OASIS//DTD DITA Concept//EN" "concept.dtd">`;
// Will fail to resolve DTD

// GOOD: Catalog setup for PUBLIC identifier resolution
const catalog = new Catalog('/path/to/catalog.xml');
builder.setCatalog(catalog);
// PUBLIC identifier resolves to actual DTD file
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
// BAD: Assuming non-null returns
const root = doc.getRoot().getName(); // May throw

// GOOD: Null checking
const root = doc.getRoot();
if (root) {
    const name = root.getName();
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
