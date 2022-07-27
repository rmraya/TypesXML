# TypesXML

Open source XML library written in TypeScript

## Features currently in development

- Parsing of the Internal Subset specified in the <!DOCTYPE> declaration

## Limitations

- Validation not supported yet
- Default values for attributes are not set when parsing an element

## On the Roadmap

- Support for XML Schemas
- Support for RelaxNG

## Example

```TypeScript
import { XMLParser } from "./XMLParser";
import { XMLDocument } from "./XMLDocument";
import { readFile } from "fs";

class Test {

    constructor() {
        try {
            readFile('sample.xml', 'utf-8', (err, data) => {
                if (err) {
                    throw new Error(err.message);
                }
                let parser: XMLParser = new XMLParser();
                let document: XMLDocument = parser.parse(data);
                console.log(document.toString());
            });
        } catch (e) {
            console.log(e.message)
        }
    }
}

new Test();
```
