#!/bin/bash

echo "Setting up MarkItDown for production..."

# Check if we're in production (Railway sets NODE_ENV)
if [ "$NODE_ENV" = "production" ] || [ "$RAILWAY_ENVIRONMENT" = "production" ]; then
    echo "Production environment detected. Installing Python and MarkItDown..."

    # Check if Python3 is already installed
    if ! command -v python3 &> /dev/null; then
        echo "Python3 not found. Attempting to install..."

        # Try apt-get (Debian/Ubuntu)
        if command -v apt-get &> /dev/null; then
            apt-get update && apt-get install -y python3 python3-pip
        # Try apk (Alpine)
        elif command -v apk &> /dev/null; then
            apk add --no-cache python3 py3-pip
        # Try yum (CentOS/RHEL)
        elif command -v yum &> /dev/null; then
            yum install -y python3 python3-pip
        else
            echo "Warning: Could not find a package manager to install Python"
            exit 0  # Don't fail the build
        fi
    else
        echo "Python3 is already installed"
    fi

    # Install MarkItDown
    if command -v python3 &> /dev/null; then
        echo "Installing MarkItDown package..."
        python3 -m pip install --user 'markitdown[all]==0.1.3' || \
        python3 -m pip install 'markitdown[all]==0.1.3' || \
        pip3 install --user 'markitdown[all]==0.1.3' || \
        pip3 install 'markitdown[all]==0.1.3' || \
        echo "Warning: Could not install MarkItDown"

        # Verify installation
        if python3 -c "import markitdown" 2>/dev/null; then
            echo "✓ MarkItDown installed successfully!"
        else
            echo "Warning: MarkItDown installation could not be verified"
        fi
    fi
else
    echo "Development environment - skipping MarkItDown setup"
fi

echo "MarkItDown setup complete"