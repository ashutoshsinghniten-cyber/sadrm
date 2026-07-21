package com.sadrm.service;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;

@Service
public class WebPConversionService {

    public static final String WEBP_CONTENT_TYPE = "image/webp";

    @Value("${app.preview.webp.dpi:220}")
    private int dpi;

    @Value("${app.preview.webp.quality:0.85}")
    private float quality;

    public List<RenderedPreviewPage> convertPdfToWebP(byte[] pdfBytes, String originalFilename) throws IOException {
        ImageIO.scanForPlugins();
        List<RenderedPreviewPage> pages = new ArrayList<>();

        try (PDDocument document = Loader.loadPDF(pdfBytes)) {
            PDFRenderer renderer = new PDFRenderer(document);
            int pageCount = document.getNumberOfPages();
            for (int i = 0; i < pageCount; i++) {
                BufferedImage rendered = renderer.renderImageWithDPI(i, dpi, ImageType.RGB);
                BufferedImage optimized = toRgb(rendered);
                byte[] webp = encodeWebP(optimized, quality);
                int pageNumber = i + 1;
                pages.add(new RenderedPreviewPage(
                        pageNumber,
                        previewFilename(originalFilename, pageNumber),
                        webp,
                        optimized.getWidth(),
                        optimized.getHeight(),
                        WEBP_CONTENT_TYPE,
                        quality
                ));
                rendered.flush();
                optimized.flush();
            }
        }
        return pages;
    }

    public String previewFilename(String originalFilename, int pageNumber) {
        String base = originalFilename == null || originalFilename.isBlank() ? "document" : originalFilename;
        int dot = base.lastIndexOf('.');
        if (dot > 0) {
            base = base.substring(0, dot);
        }
        base = base.replaceAll("[^a-zA-Z0-9._=-]+", "_")
                   .replaceAll("^_+|_+$", "");
        if (base.isBlank()) base = "document";
        return String.format(Locale.ROOT, "%s_page_%03d.webp", base, pageNumber);
    }

    private BufferedImage toRgb(BufferedImage source) {
        if (source.getType() == BufferedImage.TYPE_INT_RGB) {
            return source;
        }
        BufferedImage rgb = new BufferedImage(source.getWidth(), source.getHeight(), BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = rgb.createGraphics();
        graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        graphics.drawImage(source, 0, 0, null);
        graphics.dispose();
        return rgb;
    }

    private byte[] encodeWebP(BufferedImage image, float requestedQuality) throws IOException {
        Iterator<ImageWriter> writers = ImageIO.getImageWritersByMIMEType(WEBP_CONTENT_TYPE);
        if (!writers.hasNext()) {
            writers = ImageIO.getImageWritersByFormatName("webp");
        }
        if (!writers.hasNext()) {
            throw new IOException("No WebP ImageIO writer found. Ensure the WebP ImageIO dependency is on the classpath.");
        }

        ImageWriter writer = writers.next();
        try (ByteArrayOutputStream out = new ByteArrayOutputStream();
             ImageOutputStream imageOut = ImageIO.createImageOutputStream(out)) {
            writer.setOutput(imageOut);
            ImageWriteParam params = writer.getDefaultWriteParam();
            if (params.canWriteCompressed()) {
                params.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
                String[] compressionTypes = params.getCompressionTypes();
                if (compressionTypes != null && compressionTypes.length > 0) {
                    params.setCompressionType(compressionTypes[0]);
                }
                params.setCompressionQuality(Math.max(0.0f, Math.min(1.0f, requestedQuality)));
            }
            writer.write(null, new IIOImage(image, null, null), params);
            imageOut.flush();
            return out.toByteArray();
        } finally {
            writer.dispose();
        }
    }

    public record RenderedPreviewPage(
            int pageNumber,
            String filename,
            byte[] bytes,
            int width,
            int height,
            String contentType,
            float quality
    ) {
    }
}
