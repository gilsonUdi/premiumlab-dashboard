param([Parameter(Mandatory=$true)][string]$SchemaPath, [Parameter(Mandatory=$true)][string]$XmlPath)
$ErrorActionPreference = 'Stop'
$schemas = [System.Xml.Schema.XmlSchemaSet]::new()
$schemas.XmlResolver = [System.Xml.XmlUrlResolver]::new()
$dsSettings = [System.Xml.XmlReaderSettings]::new()
# Apenas o XSD W3C local publicado pelo governo usa entidades inline; nunca resolver DTD externo.
$dsSettings.DtdProcessing = [System.Xml.DtdProcessing]::Parse
$dsSettings.XmlResolver = $null
$dsReader = [System.Xml.XmlReader]::Create((Join-Path (Split-Path $SchemaPath) 'xmldsig-core-schema.xsd'), $dsSettings)
try { $null = $schemas.Add('http://www.w3.org/2000/09/xmldsig#', $dsReader) } finally { $dsReader.Dispose() }
$null = $schemas.Add('http://www.sped.fazenda.gov.br/nfse', $SchemaPath)
$schemas.Compile()
$settings = [System.Xml.XmlReaderSettings]::new()
$settings.Schemas = $schemas
$settings.ValidationType = [System.Xml.ValidationType]::Schema
$settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
$settings.add_ValidationEventHandler({ param($source, $event) throw $event.Exception })
$reader = [System.Xml.XmlReader]::Create($XmlPath, $settings)
try { while($reader.Read()) {} } finally { $reader.Dispose() }
Write-Output 'XSD OK'
