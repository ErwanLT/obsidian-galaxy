package fr.eletutour.obsidianback.controller;

import fr.eletutour.obsidianback.model.Universe;
import fr.eletutour.obsidianback.service.UniverseService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@CrossOrigin
@RestController
@RequestMapping("/api/universe")
public class UniverseController {

    private final UniverseService service;

    public UniverseController(UniverseService service) {
        this.service = service;
    }

    @GetMapping
    public Universe universe() {
        return service.buildUniverse();
    }
}