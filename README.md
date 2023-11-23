# TypesXML

Open source XML library written in TypeScript

Implements a SAX parser that exposes the these methods from the `ContentHandler` interface:

* setCatalog(catalog: Catalog): void;
* startDocument(): void;
* endDocument(): void;
* xmlDeclaration(version: string, encoding: string, standalone: string): void;
* startElement(name: string, atts: Array\<XMLAttribute>): void;
* endElement(name: string): void;
* internalSubset(declaration: string): void;
* characters(ch: string): void;
* ignorableWhitespace(ch: string): void;
* comment(ch: string): void;
* processingInstruction(target: string, data: string): void;
* startCDATA(): void;
* endCDATA(): void;
* startDTD(name: string, publicId: string, systemId: string): void;
* endDTD(): void;
* skippedEntity(name: string): void;

Class `DOMBuilder` implements the `ContentHandler` interface and builds a DOM tree from an XML document.

## Features currently in development

* Parsing of the Internal Subset specified in the <!DOCTYPE> declaration

## Limitations

* Validation not supported yet
* Default values for attributes are not set when parsing an element

## On the Roadmap

* Support for XML Schemas
* Support for RelaxNG

## Example

```TypeScript
import { ContentHandler } from "./ContentHandler";
import { DOMBuilder } from "./DOMBuilder";
import { SAXParser } from "./SAXParser";
import { XMLDocument } from "./XMLDocument";
import { XMLElement } from "./XMLElement";

export class Test {

    constructor() {
        try {
            let contentHandler: ContentHandler = new DOMBuilder();
            let xmlParser = new SAXParser();
            xmlParser.setContentHandler(contentHandler);
            xmlParser.parse("test.xml");
            let doc: XMLDocument = (contentHandler as DOMBuilder).getDocument();
            let root: XMLElement = doc.getRoot();
            console.log(root.toString());
        } catch (error: any) {
            if (error instanceof Error) {
                console.log(error.message);
            } else {
                console.log(error);
            }
        }
    }
}

new Test();
```
