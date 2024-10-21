const express = require('express');
const fs = require('fs-extra');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const path = require('path');

const app = express();
const PORT = 3000;

// Directorios
const instancesDir = path.join(__dirname, 'minecraft-instances');
const extractedDir = path.join(__dirname, 'extracted');

// Función para generar el hash SHA-1 de un archivo
function getFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha1');
    const stream = fs.createReadStream(filePath);
    stream.on('data', data => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// Función recursiva para obtener todos los archivos dentro de un directorio (incluyendo subcarpetas)
async function getFilesRecursively(dir, instanceName) {
  const filesList = [];
  const files = fs.readdirSync(dir, { withFileTypes: true });

  for (const file of files) {
    const filePath = path.join(dir, file.name);
    
    if (file.isDirectory()) {
      // Recursivamente obtener archivos dentro de la subcarpeta
      const nestedFiles = await getFilesRecursively(filePath, instanceName);
      filesList.push(...nestedFiles);
    } else {
      const stats = fs.statSync(filePath);
      const fileHash = await getFileHash(filePath);

      // Generar URL de descarga
      const relativePath = path.relative(path.join(extractedDir, instanceName), filePath);
      const url = `http://localhost:${PORT}/download/${instanceName}/${relativePath}`;

      filesList.push({
        url: url,
        size: stats.size,
        hash: fileHash,
        path: relativePath
      });
    }
  }

  return filesList;
}

// Función para procesar el ZIP
async function processInstanceZip(zipPath) {
  const zip = new AdmZip(zipPath);
  const instanceName = path.basename(zipPath, '.zip'); // Nombre de la instancia
  const outputDir = path.join(extractedDir, instanceName); // Directorio de extracción
  zip.extractAllTo(outputDir, true); // Extraer el ZIP

  // Obtener todos los archivos recursivamente
  const filesList = await getFilesRecursively(outputDir, instanceName);

  // Guardar el archivo JSON con la lista generada
  const jsonOutputPath = path.join(extractedDir, `${instanceName}.json`);
  fs.writeJsonSync(jsonOutputPath, filesList, { spaces: 2 });

  console.log(`Instancia ${instanceName} procesada. Lista de archivos disponible en ${jsonOutputPath}`);
  return filesList;
}

// Ruta para descargar los archivos extraídos
app.get('/download/:instanceName/*', (req, res) => {
  const { instanceName } = req.params;
  const filePath = path.join(extractedDir, instanceName, req.params[0]);
  res.download(filePath);
});

// Ruta para obtener el JSON generado
app.get('/instances/:instanceName', (req, res) => {
  const { instanceName } = req.params;
  const jsonFilePath = path.join(extractedDir, `${instanceName}.json`);
  if (fs.existsSync(jsonFilePath)) {
    res.sendFile(jsonFilePath);
  } else {
    res.status(404).json({ error: "Instancia no encontrada" });
  }
});

// Procesar todos los archivos ZIP al iniciar el servidor
app.listen(PORT, async () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);

  // Crear los directorios si no existen
  if (!fs.existsSync(instancesDir)) fs.mkdirSync(instancesDir);
  if (!fs.existsSync(extractedDir)) fs.mkdirSync(extractedDir);

  // Obtener todos los archivos ZIP en la carpeta 'minecraft-instances'
  const instanceZips = fs.readdirSync(instancesDir).filter(file => file.endsWith('.zip'));

  // Procesar cada archivo ZIP
  for (const zipFile of instanceZips) {
    const zipPath = path.join(instancesDir, zipFile);
    try {
      await processInstanceZip(zipPath);
    } catch (err) {
      console.error(`Error al procesar ${zipFile}:`, err);
    }
  }
});
