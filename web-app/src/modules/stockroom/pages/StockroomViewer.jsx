function StockroomViewer() {
    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold font-display text-primary-950">
                Stockroom
            </h1>

            <p className="text-base text-primary-600">
                This module is reserved for the planned 3D stockroom viewer of the Limen project.
            </p>

            <p className="text-base text-primary-600">
                The goal of the 3D stockroom is to give staff a visual digital map of the physical store layout so
                they can locate parts faster, understand shelf placement, and support inventory operations across
                multiple floors.
            </p>

            <div className="space-y-3 text-base text-primary-600">
                <p>The planned 3D stockroom should include the following:</p>
                <p>3-layer shelves for larger storage sections.</p>
                <p>2-layer shelves for smaller or lower-height storage sections.</p>
                <p>Walls to represent the actual boundaries of the store layout.</p>
                <p>Doors and entrance points for navigation and access flow.</p>
                <p>Floor surfaces that define each stockroom level.</p>
                <p>Cashier location to show the main service or transaction area.</p>
                <p>System location to indicate where the computer or inventory system is placed.</p>
                <p>Multi-floor support so the first floor and second floor can be viewed separately.</p>
                <p>Object placement and mapping so shelves and areas match the real physical stockroom.</p>
                <p>Part-location guidance to help users identify where an item is stored.</p>
            </div>

            <p className="text-base text-primary-600">
                For now, this page serves as the text description of the intended 3D stockroom feature.
            </p>
        </div>
    );
}

export default StockroomViewer;
