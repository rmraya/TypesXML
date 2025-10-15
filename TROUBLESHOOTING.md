# TypesXML Troubleshooting Guide

## Common Issues and Solutions

### Parsing Errors

#### "ContentHandler not set"

**Cause**: Attempting to parse without setting a ContentHandler

```typescript
// Problem
const parser = new SAXParser();
parser.parseFile('file.xml'); // Error!

// Solution
const parser = new SAXParser();
const builder = new DOMBuilder();
parser.setContentHandler(builder);
parser.parseFile('file.xml');
```

#### "Malformed XML document: unclosed elements"

**Cause**: XML is not well-formed - missing closing tags

```typescript
// Problem XML
<root><child>text</root> // Missing </child>

// Check the XML structure before parsing
```

#### "Malformed XML document: text found in prolog"

**Cause**: Text content before the root element

```typescript
// Problem XML
Some text
<?xml version="1.0"?>
<root/>

// Solution: Ensure XML declaration and root element come first
```

### Encoding Issues

#### "Error reading BOM: not enough bytes"

**Cause**: File is too small or corrupted

```typescript
// Solution: Check file size and integrity
if (fs.statSync(file).size < 3) {
    throw new Error('File too small to contain valid XML');
}
```

#### Character Encoding Problems

```typescript
// Specify encoding explicitly
parser.parseFile('file.xml', 'utf8');

// Or let the library detect it
const encoding = FileReader.detectEncoding('file.xml');
parser.parseFile('file.xml', encoding);
```

### Memory Issues

#### "Out of memory" with Large Files

**Cause**: Using DOMBuilder with very large XML files

```typescript
// Problem: DOMBuilder loads entire DOM into memory
const builder = new DOMBuilder();
parser.setContentHandler(builder);
parser.parseFile('huge-file.xml'); // May run out of memory

// Solution: Use streaming with custom ContentHandler
class StreamingHandler implements ContentHandler {
    // Process elements without storing entire DOM
    startElement(name: string, atts: XMLAttribute[]): void {
        // Process element immediately
    }
    // ... implement other methods
}
```

### File Access Issues

#### "ENOENT: no such file or directory"

```typescript
// Check file existence before parsing
import { existsSync } from 'fs';

if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
}
parser.parseFile(filePath);
```

#### Permission Errors

```typescript
// Check file permissions
import { accessSync, constants } from 'fs';

try {
    accessSync(filePath, constants.R_OK);
} catch (error) {
    throw new Error(`Cannot read file: ${filePath}`);
}
```

### DTD and External Entity Issues

#### Validation Mode Not Working

**Cause**: Incorrect order of `setValidating` and `setContentHandler` calls

```typescript
// Problem: Setting validation on builder before setting content handler
const parser = new SAXParser();
const builder = new DOMBuilder();
builder.setValidating(true);        // This gets overridden!
parser.setContentHandler(builder);  // Parser copies its validating state (false) to builder

// Solution: Set validation on parser FIRST, then set content handler
const parser = new SAXParser();
const builder = new DOMBuilder();
parser.setValidating(true);         // Set on parser first!
parser.setContentHandler(builder);  // Parser copies its validating state (true) to builder
```

**Important**: When `setContentHandler` is called, the SAXParser automatically copies its current `validating` state to the ContentHandler. Always set the validation mode on the parser before setting the content handler.

#### External DTD Not Found

```typescript
// Use catalog for DTD resolution
const catalog = new Catalog('catalog.xml');
const builder = new DOMBuilder();
builder.setCatalog(catalog);

// Or handle DTD parsing errors gracefully
try {
    parser.parseFile('file-with-dtd.xml');
} catch (error) {
    if (error.message.includes('DTD') || error.message.includes('entity')) {
        console.warn('DTD resolution failed, continuing without validation');
        // Parse without DTD validation
    }
}
```

### Namespace Issues

#### Namespace Prefix Not Resolved

**Current Limitation**: Library doesn't resolve namespace URIs

```typescript
// What you get
element.getNamespace(); // Returns 'ns' for <ns:element>
element.getName();      // Returns 'ns:element'

// What you need to do manually
const [prefix, localName] = element.getName().split(':');
const namespaceURI = lookupNamespaceURI(prefix); // Your implementation
```

## Performance Optimization

### File Size Recommendations

#### Small Files (< 1MB)

```typescript
// Use DOMBuilder for easy manipulation
const builder = new DOMBuilder();
parser.setContentHandler(builder);
```

#### Medium Files (1MB - 50MB)

```typescript
// Consider use case
if (needFullDOM) {
    // Use DOMBuilder but monitor memory
    const builder = new DOMBuilder();
} else {
    // Use streaming approach
    const streamingHandler = new CustomStreamingHandler();
}
```

#### Large Files (> 50MB)

```typescript
// Always use streaming approach
class LargeFileProcessor implements ContentHandler {
    private processedCount = 0;
    
    startElement(name: string, atts: XMLAttribute[]): void {
        // Process incrementally
        this.processedCount++;
        if (this.processedCount % 10000 === 0) {
            console.log(`Processed ${this.processedCount} elements`);
        }
    }
}
```

### Memory Management

#### Monitor Memory Usage

```typescript
// Check memory usage during processing
const used = process.memoryUsage();
console.log(`Memory usage: ${Math.round(used.heapUsed / 1024 / 1024)} MB`);
```

#### Chunked Processing

```typescript
// Process large documents in chunks
class ChunkedProcessor implements ContentHandler {
    private currentChunk: XMLElement[] = [];
    private chunkSize = 1000;
    
    startElement(name: string, atts: XMLAttribute[]): void {
        if (this.currentChunk.length >= this.chunkSize) {
            this.processChunk(this.currentChunk);
            this.currentChunk = [];
        }
    }
    
    private processChunk(elements: XMLElement[]): void {
        // Process chunk and free memory
        // ...
        elements.length = 0; // Clear array
    }
}
```

## Best Practices for Error Handling

### Comprehensive Error Handling

```typescript
function parseXMLSafely(filePath: string): XMLDocument | null {
    try {
        // Pre-flight checks
        if (!existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }
        
        const stats = statSync(filePath);
        if (stats.size === 0) {
            throw new Error('File is empty');
        }
        
        if (stats.size > 100 * 1024 * 1024) { // 100MB
            console.warn('Large file detected, consider streaming approach');
        }
        
        // Parse with appropriate handler
        const parser = new SAXParser();
        const builder = new DOMBuilder();
        parser.setContentHandler(builder);
        
        // Detect encoding
        const encoding = FileReader.detectEncoding(filePath);
        parser.parseFile(filePath, encoding);
        
        return builder.getDocument() || null;
        
    } catch (error) {
        if (error instanceof Error) {
            console.error(`XML parsing failed: ${error.message}`);
            
            // Handle specific error types
            if (error.message.includes('encoding')) {
                console.error('Try specifying encoding explicitly');
            } else if (error.message.includes('unclosed')) {
                console.error('Check XML structure for missing closing tags');
            } else if (error.message.includes('prolog')) {
                console.error('Check for content before XML declaration');
            }
        }
        return null;
    }
}
```

### Resource Cleanup

```typescript
// Ensure proper cleanup with FileReader
function parseWithCleanup(filePath: string): XMLDocument | null {
    let reader: FileReader | undefined;
    
    try {
        reader = new FileReader(filePath, 'utf8');
        // Process with reader
        const content = reader.read();
        // ...
        return document;
        
    } catch (error) {
        console.error('Parse error:', error);
        return null;
        
    } finally {
        // Always cleanup
        if (reader) {
            reader.closeFile();
        }
    }
}
```

## Testing and Validation

### Validate XML Structure

```typescript
function validateXMLStructure(xmlString: string): boolean {
    try {
        const parser = new SAXParser();
        const validator = new ValidationHandler();
        parser.setContentHandler(validator);
        parser.parseString(xmlString);
        return validator.isValid();
    } catch (error) {
        console.error('XML validation failed:', error.message);
        return false;
    }
}

class ValidationHandler implements ContentHandler {
    private isValidFlag = true;
    private elementStack: string[] = [];
    
    startElement(name: string, atts: XMLAttribute[]): void {
        this.elementStack.push(name);
        
        // Custom validation rules
        if (name === 'required-element' && atts.length === 0) {
            this.isValidFlag = false;
        }
    }
    
    endElement(name: string): void {
        const expected = this.elementStack.pop();
        if (expected !== name) {
            this.isValidFlag = false;
        }
    }
    
    isValid(): boolean {
        return this.isValidFlag && this.elementStack.length === 0;
    }
    
    // Implement other required methods...
    initialize(): void {}
    setCatalog(): void {}
    startDocument(): void {}
    endDocument(): void {}
    xmlDeclaration(): void {}
    internalSubset(): void {}
    characters(): void {}
    ignorableWhitespace(): void {}
    comment(): void {}
    processingInstruction(): void {}
    startCDATA(): void {}
    endCDATA(): void {}
    startDTD(): void {}
    endDTD(): void {}
    skippedEntity(): void {}
}
```

### Unit Testing Patterns

```typescript
// Jest/Mocha test patterns
describe('XML Processing', () => {
    test('should parse valid XML', () => {
        const xml = '<root><child>text</child></root>';
        const parser = new SAXParser();
        const builder = new DOMBuilder();
        parser.setContentHandler(builder);
        
        expect(() => parser.parseString(xml)).not.toThrow();
        
        const doc = builder.getDocument();
        expect(doc).toBeDefined();
        expect(doc?.getRoot()?.getName()).toBe('root');
    });
    
    test('should handle malformed XML gracefully', () => {
        const xml = '<root><unclosed>';
        const parser = new SAXParser();
        const builder = new DOMBuilder();
        parser.setContentHandler(builder);
        
        expect(() => parser.parseString(xml)).toThrow('unclosed elements');
    });
    
    test('should handle large files efficiently', () => {
        const startMemory = process.memoryUsage().heapUsed;
        
        // Process large file
        parseWithStreaming('large-file.xml');
        
        const endMemory = process.memoryUsage().heapUsed;
        const memoryIncrease = (endMemory - startMemory) / 1024 / 1024;
        
        expect(memoryIncrease).toBeLessThan(100); // Less than 100MB increase
    });
});
```

## Migration and Compatibility

### Upgrading from Previous Versions

```typescript
// Check for breaking changes
const version = require('typesxml/package.json').version;
if (version.startsWith('1.')) {
    // Version 1.x compatibility
    // Check for method signature changes
}
```

### Browser Compatibility

**Note**: This library is designed for Node.js environments

```typescript
// For browser use, consider alternatives or bundling strategies
// File system operations won't work in browsers
```

### TypeScript Integration

```typescript
// Use strict null checks
const doc: XMLDocument | undefined = builder.getDocument();
if (doc) {
    const root: XMLElement | undefined = doc.getRoot();
    if (root) {
        // Safe to use root
        const name: string = root.getName();
    }
}
```

This troubleshooting guide should help users and AI agents quickly identify and resolve common issues when working with the TypesXML library.
