# TypesXML

[![npm version](https://img.shields.io/npm/v/typesxml)](https://www.npmjs.com/package/typesxml)
[![npm license](https://img.shields.io/npm/l/typesxml)](LICENSE)
[![TypeScript](https://img.shields.io/badge/implementation-native%20TypeScript-3178c6)](https://www.typescriptlang.org/)

TypesXML is a native TypeScript XML library and processing toolkit — there are no bindings to C/C++ libraries or other native layers. It ships first-class DOM and SAX pipelines, validates full DTD grammars, resolves entities through OASIS XML Catalogs, and passes 100% of the W3C XML Conformance Test Suite for DTD-driven documents.

## Features

- DOM builder (`DOMBuilder`) that produces an in-memory tree and preserves lexical information needed by canonicalization.
- Streaming SAX parser with pull-based file, string, and Node.js stream entry points.
- Complete DTD parser/validator with conditional sections and parameter entities.
- Default attribute extraction from any reachable grammar (DTD, RelaxNG, or XML Schema); defaults merge during SAX parsing independent of validation mode.
- OASIS XML Catalog resolver for public/system identifiers and alternate entity sources.
- Passes 100% of the test cases in the official W3C XML Conformance Test Suite for DTD grammars (valid, invalid, not-wf, external entity cases).
- Implements strict validation for files that use XML Schema 1.0 grammars, including built-in datatypes and user-defined types with complex content models — passing 93.9% of the official W3C XML Schema Test Suite (2006 edition).
- Canonical XML renderer compatible with the W3C XML Test Suite rules.
- Strict character validation for XML 1.0/1.1 and optional DTD-validating mode.
- Pure TypeScript implementation with type definitions included—ideal for bundlers and ESM/CJS projects.
- XML↔JSON conversion APIs with both lightweight and lossless modes for simple payloads or fully faithful round-trips.

## SAX Parser

`SAXParser` drives any `ContentHandler` implementation. A handler receives structured callbacks during parsing:

```ts
interface ContentHandler {
    initialize(): void;
    setCatalog(catalog: Catalog): void;
    startDocument(): void;
    endDocument(): void;
    xmlDeclaration(version: string, encoding: string, standalone: string): void;
    startElement(name: string, atts: XMLAttribute[]): void;
    endElement(name: string): void;
    internalSubset(declaration: string): void;
    characters(text: string): void;
    ignorableWhitespace(text: string): void;
    comment(text: string): void;
    processingInstruction(target: string, data: string): void;
    startCDATA(): void;
    endCDATA(): void;
    startDTD(name: string, publicId: string, systemId: string): void;
    endDTD(): void;
    skippedEntity(name: string): void;
}
```

The built-in `DOMBuilder` implements this interface to provide DOM support out of the box.

## Installation

```bash
npm install typesxml
```

## Usage

```ts
import { DOMBuilder, SAXParser } from "typesxml";

const handler = new DOMBuilder();
const parser = new SAXParser();
parser.setContentHandler(handler);

// Parse from a file
parser.parseFile("example.xml");
const document = handler.getDocument();
console.log(document.toString());

// Parse from a string
parser.parseString("<root><child/></root>");

// Parse from a stream
// await parser.parseStream(fs.createReadStream("example.xml"));
```

To enable XML Catalog resolution or validation, configure the parser before invoking `parse*` methods:

```ts
parser.setCatalog(myCatalog);
parser.setValidating(true); // Turns on validation
```

## Documentation & Samples

- Read the step-by-step [TypesXML tutorial](docs/tutorial.md) for guided workflows.
- Use the [JSON and XML Conversion Guide](docs/jsonTutorial.md) to translate between XML documents and JSON objects, with guidance on when to enable the metadata-preserving round-trip mode.
- Explore the runnable examples under [`samples/`](samples/README.md) to see the code in action.

## Benchmark

The following benchmark compares TypesXML with fast-xml-parser and tXml using the same input files and runtime environment. Each result is the best of three runs after a warmup pass. Throughput is calculated as `file_size / duration`.

This comparison focuses on parsing speed only. Feature sets and parsing models differ significantly between libraries.

### Small to Medium Files

```text
Size: 1.858 MB | Elements: 41,349
+-----------------+---------------+-------------------+---------+
| Parser          | Duration (ms) | Throughput (MB/s) | Success |
+-----------------+---------------+-------------------+---------+
| TypesXML        |     165.20 ms |        11.25 MB/s | yes     |
| fast-xml-parser |     154.41 ms |        12.03 MB/s | yes     |
| tXml            |      17.19 ms |       108.06 MB/s | yes     |
+-----------------+---------------+-------------------+---------+

Size: 63.215 MB | Elements: 817,216
+-----------------+---------------+-------------------+---------+
| Parser          | Duration (ms) | Throughput (MB/s) | Success |
+-----------------+---------------+-------------------+---------+
| TypesXML        |    5444.54 ms |        11.61 MB/s | yes     |
| fast-xml-parser |    4294.62 ms |        14.72 MB/s | yes     |
| tXml            |     555.80 ms |       113.74 MB/s | yes     |
+-----------------+---------------+-------------------+---------+

Size: 121.517 MB | Elements: 1,883,407
+-----------------+---------------+-------------------+---------+
| Parser          | Duration (ms) | Throughput (MB/s) | Success |
+-----------------+---------------+-------------------+---------+
| TypesXML        |    8530.47 ms |        14.25 MB/s | yes     |
| fast-xml-parser |    8615.05 ms |        14.11 MB/s | yes     |
| tXml            |    1169.80 ms |       103.88 MB/s | yes     |
+-----------------+---------------+-------------------+---------+
```

tXml achieves significantly higher throughput on smaller inputs because it parses from a fully loaded in-memory string and performs minimal processing.

### Large Files (Streaming vs In-Memory)

```text
Size: 574.672 MB | Elements: 7,853,048
+-----------------+---------------+-------------------+---------+
| Parser          | Duration (ms) | Throughput (MB/s) | Success |
+-----------------+---------------+-------------------+---------+
| TypesXML        |   57134.36 ms |        10.06 MB/s | yes     |
| fast-xml-parser |           n/a |               n/a | no      |
| tXml            |           n/a |               n/a | no      |
+-----------------+---------------+-------------------+---------+
```

Both fast-xml-parser and tXml fail on this input with: `Error: Cannot create a string longer than 0x1fffffe8 characters`

These parsers require loading the entire document into a single JavaScript string. Node.js imposes a maximum string size (~512 MB), which causes parsing to fail for large inputs.

TypesXML uses a streaming SAX pipeline and processes input in chunks, allowing it to handle arbitrarily large files without hitting this limitation.

### Summary

- **tXml**: Extremely fast for small to medium files, but limited by in-memory string size
- **fast-xml-parser**: Competitive speed, but same memory limitation
- **TypesXML**: Consistent performance and capable of processing very large files reliably

If your use case involves large XML documents or streaming pipelines, TypesXML provides predictable performance where in-memory parsers cannot operate.

## W3C XML Test Suite

The repository includes code that runs the official W3C XML Conformance Test Suite for DTD and XML Schema grammars.

### DTD

1. Download the latest archive from the [W3C XML Test Suite](https://www.w3.org/XML/Test/) (e.g., `xmlts20080827.zip`).
2. Extract the archive into `./tests/xmltest` so the `valid`, `invalid`, and `not-wf` folders sit under that path.
3. Install dependencies if needed: `npm install`.
4. Run the suite:

   ```bash
   npm run testDtd
   ```

The script compiles the TypeScript sources and executes `ts/tests/DTDTestSuite.ts`, reporting any conformance failures.

### XML Schema

TypesXML currently passes **94.4%** of the W3C XML Schema Test Suite (2006 edition, ~40,000 tests), the only native TypeScript implementation of XML Schema 1.0 validated against the official W3C test suite.

1. Download the latest archive from the [XML Schema Version 1.0, 2nd Edition](https://www.w3.org/XML/2004/xml-schema-test-suite/xmlschema2006-11-06/xsts-2007-06-20.tar.gz).
2. Extract the archive into `./tests/` so the test cases are available under `./tests/xmlschema2006-11-06`.
3. Install dependencies if needed: `npm install`.
4. Run the suite:

   ```bash
   npm run testXmlSchema
   ```

The script compiles the TypeScript sources and executes `ts/tests/XmlSchemaTestSuite.ts`, reporting any conformance failures.
