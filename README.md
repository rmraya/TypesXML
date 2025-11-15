# TypesXML

[![npm version](https://img.shields.io/npm/v/typesxml)](https://www.npmjs.com/package/typesxml)
[![npm license](https://img.shields.io/npm/l/typesxml)](LICENSE)
[![TypeScript](https://img.shields.io/badge/implementation-native%20TypeScript-3178c6)](https://www.typescriptlang.org/)

TypesXML is a native TypeScript XML processing toolkit—there are no bindings to C/C++ libraries or other native layers. It ships first-class DOM and SAX pipelines, validates full DTD grammars, resolves entities through OASIS XML Catalogs, and passes 100% of the W3C XML Conformance Test Suite for DTD-driven documents.

## Features

- DOM builder (`DOMBuilder`) that produces an in-memory tree and preserves lexical information needed by canonicalization.
- Streaming SAX parser with pull-based file, string, and Node.js stream entry points.
- Complete DTD parser/validator with conditional sections and parameter entities.
- Default attribute extraction from any reachable grammar (DTD, Relax NG, or XML Schema); defaults merge during SAX parsing independent of validation mode.
- OASIS XML Catalog resolver for public/system identifiers and alternate entity sources.
- Passes 100% of the test cases in the official W3C XML Conformance Test Suite for DTD grammars (valid, invalid, not-wf, external entity cases).
- Canonical XML renderer compatible with the W3C XML Test Suite rules.
- Strict character validation for XML 1.0/1.1 and optional DTD-validating mode.
- Pure TypeScript implementation with type definitions included—ideal for bundlers and ESM/CJS projects.

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
parser.setValidating(true); // Turns on DTD validation only.
```

## Documentation & Samples

- Read the step-by-step [TypesXML tutorial](docs/tutorial.md) for guided workflows.
- Explore the runnable examples under [`samples/`](samples/README.md) to see the code in action.

## W3C XML Test Suite

The repository includes a harness that runs against the official W3C XML Conformance Test Suite for DTD grammars. To execute it locally:

1. Download the latest archive from the [W3C XML Test Suite](https://www.w3.org/XML/Test/) (e.g., `xmlts20080827.zip`).
2. Extract the archive into `./tests/xmltest` so the `valid`, `invalid`, and `not-wf` folders sit under that path.
3. Install dependencies if needed: `npm install`.
4. Run the suite:

   ```bash
   npm run testDtd
   ```

The script compiles the TypeScript sources and executes `ts/tests/DTDTestSuite.ts`, reporting any conformance failures.
