package fr.eletutour.obsidianback.service;

import fr.eletutour.obsidianback.configuration.ObsidianProperties;
import fr.eletutour.obsidianback.model.NodeType;
import fr.eletutour.obsidianback.model.SpaceNode;
import fr.eletutour.obsidianback.model.Universe;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

@Service
public class UniverseService {

    private final List<String> exclude = List.of(".obsidian", "docs", "_assets");

    private final ObsidianProperties properties;

    public UniverseService(ObsidianProperties properties) {
        this.properties = properties;
    }

    public Universe buildUniverse() {
        Path vaultRoot = Path.of(properties.getVaultPath());

        Map<String, String> index = new HashMap<>();
        walkAndIndex(vaultRoot, index);

        try (Stream<Path> stream = Files.list(vaultRoot)) {
            List<SpaceNode> children = stream
                    .sorted()
                    .map(path -> toNode(path, 0, index))
                    .filter(Objects::nonNull)
                    .filter(spaceNode -> !exclude.contains(spaceNode.name()))
                    .toList();

            return new Universe(
                    vaultRoot.getFileName().toString(),
                    children
            );

        } catch (IOException e) {
            throw new RuntimeException("Unable to scan vault", e);
        }
    }

    private void walkAndIndex(Path path, Map<String, String> index) {
        if (exclude.contains(path.getFileName().toString())) {
            return;
        }
        if (Files.isDirectory(path)) {
            try (Stream<Path> stream = Files.list(path)) {
                stream.forEach(child -> walkAndIndex(child, index));
            } catch (IOException e) {
                // Ignore
            }
        } else if (isMarkdown(path)) {
            String name = removeExtension(path.getFileName().toString()).toLowerCase();
            index.put(name, path.toAbsolutePath().toString());
        }
    }

    private SpaceNode toNode(Path path, int depth, Map<String, String> index) {
        try {
            if (Files.isDirectory(path)) {
                List<SpaceNode> children;
                try (Stream<Path> stream = Files.list(path)) {
                    children = stream
                            .sorted()
                            .map(child -> toNode(child, depth + 1, index))
                            .filter(Objects::nonNull)
                            .toList();
                }

                long markdownCount = children.stream()
                        .mapToLong(SpaceNode::markdownCount)
                        .sum();

                long size = children.stream()
                        .mapToLong(SpaceNode::size)
                        .sum();

                return new SpaceNode(
                        UUID.randomUUID().toString(),
                        path.getFileName().toString(),
                        path.toString(),
                        NodeType.DIRECTORY,
                        depth,
                        markdownCount,
                        size,
                        List.of(),
                        children
                );
            }

            if (isMarkdown(path)) {
                long size = Files.size(path);
                List<String> links = parseLinks(path, index);

                return new SpaceNode(
                        UUID.randomUUID().toString(),
                        removeExtension(path.getFileName().toString()),
                        path.toString(),
                        NodeType.MARKDOWN_FILE,
                        depth,
                        1,
                        size,
                        links,
                        List.of()
                );
            }
            return null;
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    private List<String> parseLinks(Path path, Map<String, String> index) {
        List<String> links = new ArrayList<>();
        try {
            String content = Files.readString(path);
            // Pattern to match [[TargetNote]] or [[TargetNote|Alias]] or [[TargetNote#Header|Alias]]
            Pattern pattern = Pattern.compile("\\[\\[([^\\]|#]+)(?:#[^\\]|]*)?(?:\\|[^\\]]*)?\\]\\]");
            Matcher matcher = pattern.matcher(content);
            while (matcher.find()) {
                String target = matcher.group(1).trim();
                String resolvedPath = resolveLink(target, index);
                if (resolvedPath != null && !resolvedPath.equals(path.toAbsolutePath().toString())) {
                    links.add(resolvedPath);
                }
            }
        } catch (IOException e) {
            // Ignore
        }
        return links;
    }

    private String resolveLink(String target, Map<String, String> index) {
        String targetName = target;
        int lastSlash = target.lastIndexOf('/');
        if (lastSlash != -1) {
            targetName = target.substring(lastSlash + 1);
        }
        String targetKey = targetName.toLowerCase();
        if (targetKey.endsWith(".md")) {
            targetKey = targetKey.substring(0, targetKey.length() - 3);
        }

        String absolutePath = index.get(targetKey);
        if (absolutePath != null) {
            return absolutePath;
        }

        // Try suffix matching (relative path suffix)
        String targetSuffix = target.toLowerCase();
        if (!targetSuffix.endsWith(".md")) {
            targetSuffix += ".md";
        }
        for (Map.Entry<String, String> entry : index.entrySet()) {
            String pathStr = entry.getValue().toLowerCase();
            if (pathStr.endsWith(targetSuffix)) {
                return entry.getValue();
            }
        }

        return null;
    }

    private boolean isMarkdown(Path path) {
        return Files.isRegularFile(path)
                && path.getFileName()
                .toString()
                .toLowerCase()
                .endsWith(".md");
    }

    private String removeExtension(String fileName) {
        int index = fileName.lastIndexOf('.');
        return index > 0
                ? fileName.substring(0, index)
                : fileName;
    }
}