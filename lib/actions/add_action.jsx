function addAction(f, setName) {
    try { app.unloadAction(setName, ''); } catch (e) {}
    app.loadAction(f);
}

