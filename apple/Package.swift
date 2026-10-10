// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "AURAShared",
    platforms: [
        .macOS(.v14),
        .iOS(.v17),
        .watchOS(.v10)
    ],
    products: [
        .library(
            name: "AURAShared",
            targets: ["AURAShared"]
        )
    ],
    targets: [
        .target(
            name: "AURAShared",
            path: "AURAShared"
        )
    ]
)
