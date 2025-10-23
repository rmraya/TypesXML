# Conformance Tests

You can test how well TypesXML supports DTDs and XML Schema by running the conformance tests provided by the W3C.

## DTD Tests

- Visit <https://www.w3.org/XML/Test/> and download the DTD conformance tests.
- Decompress the downloaded file into `tests/xmltest`.

### Running the DTD Tests

- Compile the project running `npm run build`.
- Run the tests using `npm testDtd`.

## XML Schema Tests

- Visit <https://www.w3.org/XML/2004/xml-schema-test-suite/index.html/> and download the XML Schema conformance tests.
- Decompress the downloaded file into `tests/xmlschema2006-11-06`.

### Running the XML Schema Tests

- Compile the project running `npm run build`.
- Run the tests using `npm testXmlSchema`.
